'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../../schema/generic-combat.v0.json');
const { createState } = require('../core/createState.js');
const { applyEvent } = require('../core/applyEvent.js');
const { availableActions, usableItems } = require('../core/selectors.js');

function use(state, params) {
  const rng = { int() { throw new Error('rng consumed'); }, next() { throw new Error('rng consumed'); } };
  return applyEvent(schema, state, { id: 'use_item', params }, rng);
}

test('use_item heals with clamp, consumes stock, and does not consume rng', () => {
  const state = createState(schema);
  state.player.pools.hp.cur = 110;
  const result = use(state, { itemId: 'health_potion' });
  assert.deepEqual(result.state.player.pools.hp, { cur: 130, max: 130 });
  assert.equal(result.state.resources.health_potion, 2);
  assert.deepEqual(result.log[0], { ok: true, event: 'use_item', itemId: 'health_potion', pool: 'hp', amount: 20, before: 110, after: 130, remaining: 2 });
});

test('use_item rejects invalid states and numeric backdoors', () => {
  let state = createState(schema);
  assert.equal(use(state, { itemId: 'missing' }).log[0].reason, 'unknown_item');
  state.resources.health_potion = 0;
  assert.equal(use(state, { itemId: 'health_potion' }).log[0].reason, 'out_of_stock');
  state = createState(schema);
  state.player.pools.hp.cur = state.player.pools.hp.max;
  const full = use(state, { itemId: 'health_potion' });
  assert.equal(full.log[0].reason, 'pool_full');
  assert.equal(full.state.resources.health_potion, 3);
  state.player.dead = true;
  state.player.pools.hp.cur = 0;
  assert.equal(use(state, { itemId: 'health_potion' }).log[0].reason, 'player_dead');
  for (const key of ['amount', 'heal', 'hp', 'mp', 'sp']) assert.equal(use(createState(schema), { itemId: 'health_potion', [key]: 1 }).log[0].reason, 'item_number_not_allowed');
  assert.equal(use(createState(schema), { itemId: 'health_potion', power: 999 }).log[0].reason, 'item_number_not_allowed');
});

test('usableItems and combat actions expose only stocked consumables', () => {
  const state = createState(schema);
  assert.deepEqual(usableItems(schema, state).map((item) => item.id), ['health_potion', 'mana_potion']);
  state.resources.mana_potion = 0;
  state.combat = { active: true, cleared: false, fled: false, enemies: [] };
  assert.deepEqual(availableActions(schema, state).actions.filter((action) => action.type === 'item'), [
    { type: 'item', itemId: 'health_potion', label: '체력 포션', pool: 'hp', amount: 40, count: 3 },
  ]);
});
