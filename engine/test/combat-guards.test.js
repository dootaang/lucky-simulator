'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEvent } = require('../core/applyEvent.js');

// 전투 중 경영 거래 차단 — 콘솔은 숨겨지지만(availableManagement가 빈 sections 반환)
// LLM에 노출된 sale/buy_item 등이 자유 텍스트로 실행되는 우회까지 엔진이 막는다(일괄 감사 지적).
const schema = {
  entities: [
    { type: 'menuItem', instances: [
      { name: '스튜', price: 100, category: '요리', consumes: { food: 1 } },
      { name: '포션', price: 50, trade: 'buy' },
    ] },
    { type: 'facility', instances: [{ id: 'kitchen', label: '주방', maxLevel: 3, upgradeCosts: { 2: 100 } }] },
  ],
  resources: [{ id: 'gold' }, { id: 'food', basePrice: 10 }],
};
const inCombat = () => ({ gold: 1000, resources: { food: 5 }, facilities: { kitchen: 1 }, combat: { active: true } });
const rng = () => ({ calls: 0, int(min) { this.calls += 1; return min; }, next() { this.calls += 1; return 0; } });

test('combat blocks trade and upgrade events without consuming rng or mutating state', () => {
  const cases = [
    ['sale', { menuName: '스튜', qty: 1 }],
    ['buy_item', { menuName: '포션', qty: 1 }],
    ['purchase', { resource: 'food', qty: 1 }],
    ['purchase_batch', { items: [{ resource: 'food', qty: 1 }] }],
    ['upgrade', { facility: 'kitchen' }],
  ];
  for (const [id, params] of cases) {
    const random = rng();
    const result = applyEvent(schema, inCombat(), { id, params }, random);
    assert.equal(result.log[0].ok, false, id);
    assert.equal(result.log[0].reason, 'in_combat', id);
    assert.equal(random.calls, 0, id);
    assert.equal(result.state.gold, 1000, id);
    assert.equal(result.state.resources.food, 5, id);
  }
});

test('the same events succeed once combat is over', () => {
  const state = inCombat();
  state.combat.active = false;
  const result = applyEvent(schema, state, { id: 'purchase', params: { resource: 'food', qty: 1 } }, rng());
  assert.equal(result.log[0].ok, true);
  assert.equal(result.state.resources.food, 6);
});
