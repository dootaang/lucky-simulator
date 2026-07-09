'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../../schema/yongsa-inn.v0.json');
const { createRng } = require('../core/rng.js');
const { createState } = require('../core/createState.js');
const { applyEvent } = require('../core/applyEvent.js');
const { runDayEnd } = require('../core/dayEnd.js');
const { roomStatus, summarize, tierOf, npcSummary } = require('../core/selectors.js');
const { deepFreeze, repCategory } = require('./helpers.js');

function step(state, rng, id, params = {}) {
  return applyEvent(schema, state, { id, params }, rng);
}

function runSequence(seed) {
  const rng = createRng(seed);
  let state = createState(schema);
  const events = [
    ['checkin', { roomNo: 106, guestName: 'silvia', stayDays: 2 }],
    ['sale', { menuName: '고기 스튜', qty: 2 }],
    ['sale', { menuName: '에일', qty: 3 }],
    ['scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' }],
    ['scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' }],
    ['day_end', {}],
    ['scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' }],
    ['rep_event', { axis: 'advent', category: 'C급 의뢰' }],
    ['rep_event', { axis: 'advent', category: 'C급 의뢰' }],
    ['rep_event', { axis: 'advent', category: 'C급 의뢰' }],
    ['hire', { npcId: 'silvia', dailyWage: 100000 }],
    ['day_end', {}],
  ];
  const logs = [];
  for (const [id, params] of events) {
    const result = step(state, rng, id, params);
    state = result.state;
    logs.push(result.log);
  }
  return { state, logs };
}

test('G1 createState initializes schema-backed state', () => {
  const state = createState(schema);
  assert.equal(state.day, 1);
  assert.equal(state.gold, 500000);
  assert.equal(state.resources.food, 20);
  assert.equal(state.resources.drink, 20);
  assert.deepEqual(state.claimedRewards, []);
  assert.equal(state.npcs.silvia.affinity, 50);
  assert.deepEqual(state.rooms, {});
  assert.equal(roomStatus(schema, state).filter((room) => room.occupants.length).length, 0);
});

test('G2 checkin and manual sales update prepaid gold and stock', () => {
  const rng = createRng(42);
  let state = createState(schema);
  state = step(state, rng, 'checkin', { roomNo: 106, guestName: 'silvia', stayDays: 2 }).state;
  state = step(state, rng, 'sale', { menuName: '고기 스튜', qty: 2 }).state;
  state = step(state, rng, 'sale', { menuName: '에일', qty: 3 }).state;
  assert.equal(state.gold, 695000);
  assert.equal(state.resources.food, 18);
  assert.equal(state.resources.drink, 17);
  assert.deepEqual(state.rooms['106'], [{ guestName: 'silvia', nightsLeft: 2 }]);
});

test('G3 affinity delta caps once per day and reports tier boundary', () => {
  const rng = createRng(42);
  let state = createState(schema);
  let result = step(state, rng, 'scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' });
  state = result.state;
  assert.equal(state.npcs.silvia.affinity, 52);
  assert.equal(result.log[0].delta, 2);

  result = step(state, rng, 'scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' });
  state = result.state;
  assert.equal(state.npcs.silvia.affinity, 52);
  assert.equal(result.log[0].capped, true);

  state = step(state, rng, 'day_end').state;
  result = step(state, rng, 'scale_delta', { scale: 'affinity', target: 'silvia', size: 'M', direction: '+' });
  assert.equal(result.state.npcs.silvia.affinity, 54);

  const boundary = createState(schema);
  boundary.npcs.silvia.affinity = 80;
  result = step(boundary, rng, 'scale_delta', { scale: 'affinity', target: 'silvia', size: 'S', direction: '+' });
  assert.equal(result.state.npcs.silvia.affinity, 81);
  assert.deepEqual(result.log[0].tierChanged, {
    from: tierOf(schema, 'affinity', 80),
    to: tierOf(schema, 'affinity', 81),
  });
});

test('G4 reputation promotion reset and demoteBorrow are deterministic', () => {
  const rng = createRng(42);
  let state = createState(schema);
  const deltas = [];
  for (let i = 0; i < 3; i++) {
    const result = step(state, rng, 'rep_event', { axis: 'advent', category: 'C급 의뢰' });
    state = result.state;
    deltas.push(result.log[0].delta);
  }
  assert.deepEqual(deltas, [36, 57, 45]);
  assert.deepEqual(state.reputation.advent, { rank: 'D', exp: 0 });

  const negative = step(state, rng, 'rep_event', { axis: 'advent', category: '의뢰 실패' });
  assert.equal(negative.log[0].delta, -16);
  assert.deepEqual(negative.state.reputation.advent, { rank: 'E', exp: 84 });
  assert.deepEqual(negative.log[0].rankChanged, { from: 'D', to: 'E', type: 'demote' });
});

test('G5 dayEnd settlement, wage deduction, and stock shortage snapshot', () => {
  const rng = createRng(42);
  let state = createState(schema);
  state = step(state, rng, 'hire', { npcId: 'silvia', dailyWage: 100000 }).state;
  const result = runDayEnd(schema, state, rng);
  assert.equal(result.report.customers, 9);
  assert.equal(result.report.grossGold, 130000);
  assert.equal(result.report.foodUsed, 9);
  assert.equal(result.report.drinkUsed, 9);
  assert.equal(result.report.wagesDue, 100000);
  assert.equal(result.report.wagesPaid, 100000);
  assert.equal(result.state.gold, 530000);
  assert.equal(result.state.day, 2);

  const lowStock = createState(schema);
  lowStock.resources.food = 1;
  lowStock.resources.drink = 1;
  const shortage = runDayEnd(schema, lowStock, createRng(42));
  assert.equal(shortage.report.turnedAway, 8);
  assert.equal(shortage.report.grossGold, 15000);
  assert.deepEqual(shortage.state.resources, { food: 0, drink: 0 });
});

test('G6 checkout occurs after nightsLeft reaches zero', () => {
  const rng = createRng(42);
  let state = createState(schema);
  state = step(state, rng, 'checkin', { roomNo: 106, guestName: 'guest', stayDays: 2 }).state;
  state = runDayEnd(schema, state, rng).state;
  const result = runDayEnd(schema, state, rng);
  assert.deepEqual(result.state.pendingCheckouts, [{ roomNo: '106', guestName: 'guest' }]);
  assert.deepEqual(result.state.rooms, {});
});

test('G7 same seed and event stream produce identical final state', () => {
  const a = runSequence(42);
  const b = runSequence(42);
  const c = runSequence(43);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  assert.notEqual(JSON.stringify(a.state), JSON.stringify(c.state));
});

test('G8 applyEvent does not mutate frozen input state', () => {
  const state = createState(schema);
  const before = JSON.stringify(state);
  deepFreeze(state);
  const result = step(state, createRng(42), 'sale', { menuName: '고기 스튜', qty: 1 });
  assert.equal(result.log[0].ok, true);
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.state.resources.food, 19);
});

test('M3c reward uses schema table and seeded rng without amount params', () => {
  const state = createState(schema);
  const before = JSON.stringify(state);
  deepFreeze(state);

  const result = step(state, createRng(42), 'reward', { questId: 'quest-c', tier: 'C', reason: 'quest complete' });
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].questId, 'quest-c');
  assert.equal(result.log[0].tier, 'C');
  assert.equal(result.log[0].goldDelta, 265276);
  assert.equal(result.state.gold, 765276);
  assert.deepEqual(result.state.claimedRewards, ['quest-c']);
  assert.equal(JSON.stringify(state), before);

  const missing = step(state, createRng(42), 'reward', { questId: 'quest-z', tier: 'Z', reason: 'bad tier' });
  assert.equal(missing.log[0].ok, false);
  assert.equal(missing.log[0].reason, 'unknown_reward_tier');
  assert.equal(missing.state, state);

  const withAmount = step(state, createRng(42), 'reward', { questId: 'quest-amount', tier: 'C', amount: 1, reason: 'bad params' });
  assert.equal(withAmount.log[0].ok, false);
  assert.equal(withAmount.log[0].reason, 'reward_amount_not_allowed');
  assert.equal(withAmount.state, state);
});

test('M3d upgrade uses schema costs and rejects invalid upgrades without mutation', () => {
  const rng = createRng(42);
  const state = createState(schema);
  state.gold = 1000000;
  const before = JSON.stringify(state);
  deepFreeze(state);

  const result = step(state, rng, 'upgrade', { facility: 'tavern' });
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].facility, 'tavern');
  assert.equal(result.log[0].level, 2);
  assert.equal(result.log[0].goldDelta, -750000);
  assert.equal(result.state.gold, 250000);
  assert.equal(result.state.facilities.tavern, 2);
  assert.equal(JSON.stringify(state), before);

  const poor = createState(schema);
  const insufficient = step(poor, createRng(42), 'upgrade', { facility: 'tavern' });
  assert.equal(insufficient.log[0].ok, false);
  assert.equal(insufficient.log[0].reason, 'insufficient_gold');
  assert.equal(insufficient.state, poor);

  const maxed = createState(schema);
  maxed.facilities.tavern = 4;
  const max = step(maxed, createRng(42), 'upgrade', { facility: 'tavern' });
  assert.equal(max.log[0].ok, false);
  assert.equal(max.log[0].reason, 'max_level');
  assert.equal(max.state, maxed);
});

test('M3d reward requires questId and blocks duplicate claims', () => {
  const rng = createRng(42);
  let state = createState(schema);

  const first = step(state, rng, 'reward', { questId: 'q1', tier: 'D', reason: 'quest complete' });
  assert.equal(first.log[0].ok, true);
  assert.equal(first.log[0].goldDelta, 106110);
  assert.equal(first.state.gold, 606110);
  assert.deepEqual(first.state.claimedRewards, ['q1']);

  state = first.state;
  const beforeSecondGold = state.gold;
  const second = step(state, rng, 'reward', { questId: 'q1', tier: 'D', reason: 'repeat claim' });
  assert.equal(second.log[0].ok, false);
  assert.equal(second.log[0].reason, 'already_claimed');
  assert.equal(second.state, state);
  assert.equal(second.state.gold, beforeSecondGold);

  const missing = step(createState(schema), createRng(42), 'reward', { tier: 'D', reason: 'missing quest id' });
  assert.equal(missing.log[0].ok, false);
  assert.equal(missing.log[0].reason, 'missing_questId');
});

test('M3d gain_resource uses schema gather ranges and seeded rng', () => {
  const rng = createRng(42);
  let state = createState(schema);

  let result = step(state, rng, 'gain_resource', { resource: 'food', scale: 'small', reason: 'forage' });
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].qty, 1);
  assert.equal(result.state.resources.food, 21);

  state = result.state;
  result = step(state, rng, 'gain_resource', { resource: 'drink', scale: 'large', reason: 'brew supplies' });
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].qty, 10);
  assert.equal(result.state.resources.drink, 30);

  state = result.state;
  result = step(state, rng, 'gain_resource', { resource: 'food', scale: 'bulk', reason: 'monster byproducts' });
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].qty, 15);
  assert.equal(result.state.resources.food, 36);

  const unknown = step(state, createRng(42), 'gain_resource', { resource: 'wood', scale: 'small' });
  assert.equal(unknown.log[0].ok, false);
  assert.equal(unknown.log[0].reason, 'unknown_resource');
  assert.equal(unknown.state, state);
});

test('M3c dayEnd repays unpaid wages from automatic revenue before new wages', () => {
  const state = createState(schema);
  state.gold = 0;
  state.unpaidWages = 120000;

  const result = runDayEnd(schema, state, createRng(42));
  assert.equal(result.report.grossGold, 130000);
  assert.equal(result.report.unpaidWagesBefore, 120000);
  assert.equal(result.report.unpaidWagesPaid, 120000);
  assert.equal(result.report.unpaidWagesAfter, 0);
  assert.equal(result.state.gold, 10000);
  assert.equal(result.state.unpaidWages, 0);
});

test('selectors produce compact Korean state summary and NPC tier summary', () => {
  const state = createState(schema);
  const summary = summarize(schema, state);
  assert.ok(summary.includes('[여관] 1일차'));
  assert.ok(summary.split('\n').length <= 4);
  assert.ok(npcSummary(schema, state, 'silvia').includes('실비아: 호감 50'));
});
