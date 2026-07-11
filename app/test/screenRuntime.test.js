'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeScreens, evaluateCondition, selectScreenData, resolveEvent, safePath } = require('../core/screens/runtime.js');

test('화면·내비게이션은 중복과 없는 화면을 제거하고 object/array region을 통일한다', () => {
  const result = normalizeScreens([{ id: 'main', regions: [{ widget: 'stat-strip' }] }, { id: 'main' }, { id: 'modal', presentation: 'modal', regions: { body: [] } }], [{ screenId: 'main', label: '홈' }, { screenId: 'missing' }]);
  assert.deepEqual(result.screens.map((screen) => screen.id), ['main', 'modal']);
  assert.equal(result.navigation.length, 1); assert.equal(result.issues[0].reason, 'duplicate');
  assert.equal(result.screens[0].regions.main[0].widget, 'stat-strip');
});

test('조건식은 허용 AST와 own-property 경로만 평가하고 임의 코드는 거부한다', () => {
  const context = { state: { gold: 100, tags: ['hunter'] } };
  assert.equal(evaluateCondition({ all: [{ path: 'state.gold', op: 'gte', value: 50 }, { path: 'state.tags', op: 'includes', value: 'hunter' }] }, context), true);
  assert.equal(evaluateCondition({ path: 'state.__proto__.polluted', op: 'truthy' }, context), false);
  assert.equal(evaluateCondition({ path: 'state.gold', op: 'eval', value: 'evil()' }, context), false);
  assert.equal(safePath(context, 'state.constructor'), undefined);
});

test('selector 데이터와 버튼 params는 state/selection에서 안전하게 연결된다', () => {
  const context = { state: { gold: 10 }, selection: { questId: 'q1' } };
  assert.equal(selectScreenData('state.gold', context), 10);
  assert.deepEqual(resolveEvent({ id: 'attempt_quest', params: { questId: { $path: 'selection.questId' } } }, context), { id: 'attempt_quest', params: { questId: 'q1' } });
  assert.equal(resolveEvent({ params: {} }, context), null);
});

