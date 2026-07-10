'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../../schema/hunters-combat.v0.json');
const { createRng } = require('../core/rng.js');
const { createState } = require('../core/createState.js');
const { applyEvent } = require('../core/applyEvent.js');
const { resolveCheck } = require('../core/resolveCheck.js');
const { normalizePool, poolDamage, poolSpend, poolHeal, isDead } = require('../core/pools.js');
const { availableActions } = require('../core/selectors.js');

// 굴림을 완전 통제하는 스크립트 rng: int()이 리스트 값을 순서대로 반환.
function seqRng(values) {
  let i = 0;
  return {
    int() { return values[i++]; },
    next() { return 0.5; },
  };
}
function step(state, rng, id, params = {}) {
  return applyEvent(schema, state, { id, params }, rng);
}

// ---------- resolveCheck (경계값) ----------

test('C1 resolveCheck DC mode: nat-max=critical, nat-1=critical failure', () => {
  assert.equal(resolveCheck(seqRng([20]), { mode: 'dc', sides: 20, dc: 10 }).tier, 'critical_success');
  assert.equal(resolveCheck(seqRng([1]), { mode: 'dc', sides: 20, dc: 10 }).tier, 'critical_failure');
  assert.equal(resolveCheck(seqRng([10]), { mode: 'dc', sides: 20, dc: 10 }).tier, 'success');
  assert.equal(resolveCheck(seqRng([9]), { mode: 'dc', sides: 20, dc: 10 }).tier, 'failure');
  // modifier lifts a low raw roll to success, but not to a crit (crit uses raw roll)
  const r = resolveCheck(seqRng([9]), { mode: 'dc', sides: 20, dc: 10, mod: 5 });
  assert.equal(r.success, true);
  assert.equal(r.tier, 'success');
});

test('C2 resolveCheck rate mode: <=5 crit success, >=95 crit failure', () => {
  assert.equal(resolveCheck(seqRng([3]), { mode: 'rate', rate: 50 }).tier, 'critical_success');
  assert.equal(resolveCheck(seqRng([50]), { mode: 'rate', rate: 50 }).tier, 'success');
  assert.equal(resolveCheck(seqRng([60]), { mode: 'rate', rate: 50 }).tier, 'failure');
  assert.equal(resolveCheck(seqRng([96]), { mode: 'rate', rate: 50 }).tier, 'critical_failure');
});

// ---------- pools ----------

test('C3 pools clamp, spend rejection, death', () => {
  assert.deepEqual(poolDamage({ cur: 30, max: 30 }, 50), { cur: 0, max: 30 });
  assert.deepEqual(poolHeal({ cur: 10, max: 30 }, 999), { cur: 30, max: 30 });
  assert.equal(poolSpend({ cur: 10, max: 50 }, 20), null); // 부족 → 거부
  assert.deepEqual(poolSpend({ cur: 30, max: 50 }, 20), { cur: 10, max: 50 });
  assert.equal(isDead({ cur: 0, max: 30 }), true);
});

test('C4 createState normalizes player pools from schema', () => {
  const state = createState(schema);
  assert.deepEqual(state.player.pools.hp, { cur: 90, max: 130 });
  assert.deepEqual(state.player.pools.mp, { cur: 90, max: 150 });
  assert.equal(state.combat, null);
});

// ---------- encounter ----------

test('C5 start_encounter freezes enemy roster', () => {
  const state = createState(schema);
  const r = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 30, def: 2, evade: 10, rank: 'E' }] });
  assert.equal(r.log[0].ok, true);
  assert.equal(r.state.combat.active, true);
  assert.deepEqual(r.state.combat.enemies[0].hp, { cur: 30, max: 30 });
  assert.equal(r.state.combat.enemies[0].id, 'e1');
});

test('C6 attack: engine computes hit and damage; crit doubles; kill marks dead', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 30, def: 2, evade: 10 }] }).state;
  // 굴림 20 = nat-max crit hit: dmg = (atk12 - def2) * 2 = 20 → hp 30→10
  let r = step(state, seqRng([20]), 'combat_action', { action: 'attack', target: 'e1' });
  assert.equal(r.log[0].hit, true);
  assert.equal(r.log[0].tier, 'critical_success');
  assert.equal(r.log[0].damage, 20);
  assert.deepEqual(r.state.combat.enemies[0].hp, { cur: 10, max: 30 });
  state = r.state;
  // 굴림 15 = 일반 명중: dmg = 12-2 = 10 → hp 10→0 사망
  r = step(state, seqRng([15]), 'combat_action', { action: 'attack', target: 'e1' });
  assert.equal(r.log[0].damage, 10);
  assert.equal(r.state.combat.enemies[0].dead, true);
  assert.equal(r.state.combat.cleared, true);
});

test('C7 miss deals no damage', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 30, evade: 15 }] }).state;
  const r = step(state, seqRng([1]), 'combat_action', { action: 'attack', target: 'e1' }); // nat 1 miss
  assert.equal(r.log[0].hit, false);
  assert.equal(r.log[0].damage, 0);
  assert.deepEqual(r.state.combat.enemies[0].hp, { cur: 30, max: 30 });
});

test('C8 skill spends MP; insufficient MP is rejected', () => {
  let state = createState(schema);
  state.player.pools.mp = { cur: 10, max: 150 }; // 파워 스트라이크 cost 20 → 부족
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '오크', hp: 60, def: 3, evade: 10 }] }).state;
  const rej = step(state, seqRng([20]), 'combat_action', { action: 'skill', skill: 'power_strike', target: 'e1' });
  assert.equal(rej.log[0].ok, false);
  assert.equal(rej.log[0].reason, 'insufficient_mp');
  // MP 충전 후 성공: dmg = (atk12 + power10 - def3) = 19, 굴림 15 일반명중
  state.player.pools.mp = { cur: 90, max: 150 };
  const r = step(state, seqRng([15]), 'combat_action', { action: 'skill', skill: 'power_strike', target: 'e1' });
  assert.equal(r.log[0].damage, 19);
  assert.deepEqual(r.state.player.pools.mp, { cur: 70, max: 150 });
});

test('C9 dead target and number params are rejected', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '슬라임', hp: 8, def: 0, evade: 5 }] }).state;
  state = step(state, seqRng([20]), 'combat_action', { action: 'attack', target: 'e1' }).state; // crit 24 > 8 → dead
  assert.equal(step(state, seqRng([20]), 'combat_action', { action: 'attack', target: 'e1' }).log[0].reason, 'target_dead');
  assert.equal(step(state, seqRng([20]), 'combat_action', { action: 'attack', target: 'e1', power: 999 }).log[0].reason, 'combat_number_not_allowed');
});

test('C10 enemy_action damages player; guard halves; death flag', () => {
  let state = createState(schema);
  state.player.pools.hp = { cur: 20, max: 130 };
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '오우거', hp: 100, atk: 30, acc: 5 }] }).state;
  // 방어 후 피격: dmg = max(1, atk30 - def5) = 25, guard 0.5 → 12 → hp 20→8
  state = step(state, seqRng([]), 'combat_action', { action: 'defend' }).state;
  let r = step(state, seqRng([11]), 'enemy_action', { enemyId: 'e1', action: 'attack' }); // player evade 11, +acc5 → hit
  assert.equal(r.log[0].hit, true);
  assert.equal(r.log[0].damage, 12);
  assert.deepEqual(r.state.player.pools.hp, { cur: 8, max: 130 });
  assert.equal(r.state.combat.guard, false);
  state = r.state;
  // 방어 없이 다시 피격: dmg 25 > 8 → 사망
  r = step(state, seqRng([11]), 'enemy_action', { enemyId: 'e1', action: 'attack' });
  assert.equal(r.log[0].damage, 25);
  assert.equal(r.state.player.dead, true);
});

test('C11 flee resolves via rate check', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '늑대', hp: 20 }] }).state;
  assert.equal(step(state, seqRng([3]), 'combat_action', { action: 'flee' }).state.combat.active, false); // roll 3 <= 50 성공
  assert.equal(step(state, seqRng([80]), 'combat_action', { action: 'flee' }).state.combat.active, true); // roll 80 실패
});

test('C12 end_encounter awards exp on victory and clears combat', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 6, def: 0, evade: 5, rank: 'E' }] }).state;
  state = step(state, seqRng([15]), 'combat_action', { action: 'attack', target: 'e1' }).state; // dmg 12 > 6 → cleared
  const before = state.player.exp;
  const r = step(state, seqRng([18]), 'end_encounter', {}); // expTable E [10,20] → int returns 18
  assert.equal(r.log[0].outcome, 'victory');
  assert.equal(r.log[0].expGained, 18);
  assert.equal(r.state.player.exp, before + 18);
  assert.equal(r.state.combat, null);
});

test('C13 unresolved encounter cannot be ended', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 30 }] }).state;
  assert.equal(step(state, createRng(1), 'end_encounter', {}).log[0].reason, 'encounter_unresolved');
});

test('C14 determinism: same seed reproduces identical encounter', () => {
  function run() {
    let state = createState(schema);
    const rng = createRng('battle-1');
    state = step(state, rng, 'start_encounter', { enemies: [{ name: '고블린', hp: 40, def: 2, evade: 12, rank: 'E' }] }).state;
    for (let i = 0; i < 3; i++) state = step(state, rng, 'combat_action', { action: 'attack', target: 'e1' }).state;
    state = step(state, rng, 'enemy_action', { enemyId: 'e1', action: 'attack' }).state;
    return state;
  }
  assert.deepEqual(run(), run());
});

test('C15 encounter does not regress inn intents (pure applyEvent)', () => {
  const state = createState(schema);
  const frozen = JSON.stringify(state);
  const r = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 30 }] });
  assert.equal(JSON.stringify(state), frozen); // 입력 state 불변
  assert.notEqual(r.state, state);
});

test('C16 availableActions exposes living targets, affordability, and flee rate', () => {
  let state = createState(schema);
  state.player.pools.mp.cur = 10;
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '생존', hp: 20 }, { name: '사망', hp: 5 }] }).state;
  state.combat.enemies[1].hp.cur = 0;
  state.combat.enemies[1].dead = true;
  const result = availableActions(schema, state);
  assert.deepEqual(result.actions[0].targets.map((target) => target.id), ['e1']);
  assert.equal(result.actions.find((action) => action.skill === 'power_strike').affordable, false);
  assert.equal(result.actions.find((action) => action.type === 'flee').rate, schema.combat.fleeRate);
  assert.deepEqual(availableActions(schema, createState(schema)), { active: false });
});

test('C17 enemy_turn resolves living roster in order and guard is consumed by first hit', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [
    { name: '첫째', hp: 20, atk: 15, acc: 0 },
    { name: '둘째', hp: 20, atk: 15, acc: 0 },
    { name: '죽은 적', hp: 20, atk: 99, acc: 99 },
  ] }).state;
  state.combat.enemies[2].dead = true;
  state.combat.enemies[2].hp.cur = 0;
  state = step(state, seqRng([]), 'combat_action', { action: 'defend' }).state;
  const result = step(state, seqRng([11, 11]), 'enemy_turn');
  assert.deepEqual(result.log[0].results.map((entry) => entry.enemyId), ['e1', 'e2']);
  assert.deepEqual(result.log[0].results.map((entry) => entry.damage), [5, 10]);
  assert.equal(result.state.player.pools.hp.cur, 75);
  assert.equal(result.state.combat.guard, false);
});

test('C17b guard does not carry over when every enemy misses (audit fix)', () => {
  let state = createState(schema);
  state = step(state, createRng(1), 'start_encounter', { enemies: [{ name: '고블린', hp: 20, atk: 15, acc: 0 }] }).state;
  state = step(state, seqRng([]), 'combat_action', { action: 'defend' }).state;
  const result = step(state, seqRng([1]), 'enemy_turn'); // nat 1 — 빗나감
  assert.equal(result.log[0].results[0].hit, false);
  assert.equal(result.state.combat.guard, false); // 전원 빗나가도 방어는 턴 종료와 함께 해제
});

test('C18 enemy_turn stops when the player dies and is deterministic', () => {
  function run() {
    let state = createState(schema);
    state.player.pools.hp.cur = 8;
    const rng = createRng('enemy-turn');
    state = step(state, rng, 'start_encounter', { enemies: [{ name: 'A', hp: 20, atk: 30, acc: 20 }, { name: 'B', hp: 20, atk: 30, acc: 20 }] }).state;
    return step(state, rng, 'enemy_turn');
  }
  const first = run();
  assert.equal(first.log[0].results.length, 1);
  assert.equal(first.log[0].playerDead, true);
  assert.deepEqual(first, run());
});
