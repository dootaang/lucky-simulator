'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEvent } = require('../core/applyEvent.js');
const { availableManagement } = require('../core/selectors.js');

const schema = {
  combat: {}, pools: {}, encounters: { pool: [{ id: 'wolves', name: '들개 떼', rank: 'E', count: [1, 2] }] },
  quests: [{ id: 'hunt', name: '토벌', rewardTier: 'E', check: { mode: 'rate', rate: 100 }, encounterChance: 100 }],
  rewards: { gold: { E: [10, 10] } },
};
const state = (seed = 7) => ({ seed, day: 1, gold: 0, claimedRewards: [], player: { level: 1, exp: 0, pools: { hp: { cur: 30, max: 30 } } } });
const rng = { next: () => 0, int: (min) => min };

test('quest encounter is reproducible and defers quest resolution', () => {
  const a = applyEvent(schema, state(), { id: 'attempt_quest', params: { questId: 'hunt' } }, rng);
  const b = applyEvent(schema, state(), { id: 'attempt_quest', params: { questId: 'hunt' } }, rng);
  assert.deepEqual(a.state.combat.enemies, b.state.combat.enemies);
  assert.deepEqual(a.state.pendingQuest, { questId: 'hunt', day: 1 });
  assert.equal(a.state.gold, 0); assert.equal(a.log[0].success, undefined);
});

test('victory continuation skips encounter roll and resolves quest', () => {
  let current = applyEvent(schema, state(), { id: 'attempt_quest', params: { questId: 'hunt' } }, rng).state;
  current.combat.cleared = true; current.combat.enemies.forEach((enemy) => { enemy.dead = true; enemy.hp.cur = 0; });
  current = applyEvent(schema, current, { id: 'end_encounter', params: {} }, rng).state;
  const item = availableManagement(schema, current).sections.find((s) => s.type === 'quests').items[0];
  assert.equal(item.pending, true);
  const result = applyEvent(schema, current, { id: 'attempt_quest', params: { questId: 'hunt' } }, rng);
  assert.equal(result.log[0].success, true); assert.equal(result.state.pendingQuest, undefined); assert.equal(result.state.gold >= 10, true);
});

test('defeat keeps pending quest retryable', () => {
  let current = applyEvent(schema, state(), { id: 'attempt_quest', params: { questId: 'hunt' } }, rng).state;
  current.player.dead = true; current.player.pools.hp.cur = 0;
  current = applyEvent(schema, current, { id: 'end_encounter', params: {} }, rng).state;
  assert.deepEqual(current.pendingQuest, { questId: 'hunt', day: 1 });
  assert.equal(availableManagement(schema, current).sections.find((s) => s.type === 'quests').items[0].pending, true);
});

test('chance zero or missing pool preserves direct quest behavior', () => {
  for (const altered of [{ ...schema, quests: [{ ...schema.quests[0], encounterChance: 0 }] }, { ...schema, encounters: undefined }]) {
    const result = applyEvent(altered, state(), { id: 'attempt_quest', params: { questId: 'hunt' } }, rng);
    assert.equal(result.log[0].success, true); assert.equal(result.state.combat, undefined);
  }
});

test('day boundary clears pending quest', () => {
  const s = state(); s.pendingQuest = { questId: 'hunt', day: 1 };
  const result = applyEvent({ ...schema, processes: [] }, s, { id: 'day_end', params: {} }, rng);
  assert.equal(result.state.day, 2); assert.equal(result.state.pendingQuest, undefined);
});

test('manual combat is opt-in in play view source', () => {
  const fs = require('node:fs'); const source = fs.readFileSync(require('node:path').join(__dirname, '../../app/src/playView.js'), 'utf8');
  assert.match(source, /simbot\.play\.manualCombat/); assert.match(source, /디버그: 수동 전투 개시/);
});
