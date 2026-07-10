'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSchema } = require('../src/schema/validate.js');

function base(extra = {}) {
  return Object.assign({
    meta: { id: 'combat-test', title: '전투 테스트', schemaVersion: '0.1' },
    resources: [], scales: [], ladders: [], entities: [], events: [],
  }, extra);
}

function errors(result) {
  return result.issues.filter((issue) => issue.level === 'error');
}

test('valid pools, combat, and skills produce zero errors', () => {
  const result = validateSchema(base({
    pools: [{ id: 'hp', label: '체력', max: 100 }],
    combat: { d: 20, minDamage: 1, critMult: 2, guardMult: 0.5, fleeRate: 50, expTable: { E: [1, 2] }, lootGold: { default: [3, 4] } },
    skills: { slash: { name: '베기', cost: 0, pool: 'sp', power: 3, acc: 1 } },
    initialState: { player: { pools: { hp: { cur: 100, max: 100 } } } },
  }));
  assert.deepEqual(errors(result), []);
});

test('player hp/mp/sp scales are promoted and initialized', () => {
  const result = validateSchema(base({ scales: [
    { id: 'hp', owner: 'player', range: [0, 120], default: 100 },
    { id: 'mana', owner: 'player', range: [0, 80], default: 60 },
    { id: 'stamina', owner: 'player', range: [0, 70], default: 50 },
  ] }));
  assert.deepEqual(result.schema.pools.map((pool) => [pool.id, pool.max]), [['hp', 100], ['mp', 60], ['sp', 50]]);
  assert.equal(result.schema.scales.length, 0);
  assert.equal(result.schema.initialState.player.pools.mp.cur, 60);
  assert.ok(result.issues.some((issue) => issue.level === 'warn' && /scales에서 pools로 승격/.test(issue.msg)));
});

test('review-shaped hunter schema promotes pools with zero errors and remains combat capable', () => {
  const tier = { range: [1, 20], label: 'E', brief: '초급' };
  const result = validateSchema(base({ scales: [
    { id: 'HP', owner: 'player', range: [0, 130], default: 130 },
    { id: 'MP', owner: 'player', range: [0, 150], default: 150 },
    { id: 'SP', owner: 'player', range: [0, 100], default: 100 },
    { id: 'strength', owner: 'player', range: [1, 99], default: 12, tiers: [tier] },
    { id: 'sense', owner: 'player', range: [1, 99], default: 11, tiers: [tier] },
  ] }));
  assert.deepEqual(errors(result), []);
  assert.deepEqual(result.schema.pools.map((pool) => pool.id), ['hp', 'mp', 'sp']);
  assert.ok(result.schema.pools || result.schema.combat);
  assert.deepEqual(result.schema.scales.map((scale) => scale.id), ['strength', 'sense']);
});

test('invalid combat values are warnings and are removed for engine defaults', () => {
  const result = validateSchema(base({ combat: { critMult: 'x', expTable: { E: 'broken', D: [4, 2], C: [1, 3] } } }));
  assert.deepEqual(errors(result), []);
  assert.equal(result.schema.combat.critMult, undefined);
  assert.deepEqual(result.schema.combat.expTable, { C: [1, 3] });
  assert.ok(result.issues.filter((issue) => issue.level === 'warn').length >= 3);
});

test('player level thresholds remove leading zero and non-increasing values', () => {
  const result = validateSchema(base({ ladders: [{ id: 'player_level', currency: 'exp', sources: {}, thresholds: [0, 100, 100, 200, 'bad'] }] }));
  assert.deepEqual(result.schema.ladders[0].thresholds, [100, 200]);
  assert.ok(result.issues.some((issue) => issue.level === 'warn' && issue.path.endsWith('.thresholds')));
});

test('skill acc outside d20 modifier range resets to zero while valid acc stays', () => {
  const result = validateSchema(base({ skills: {
    percentLike: { cost: 2, pool: 'mp', power: 9, acc: 100 },
    valid: { cost: 3, pool: 'sp', power: 7, acc: 5 },
  } }));
  assert.equal(result.schema.skills.percentLike.acc, 0);
  assert.equal(result.schema.skills.percentLike.power, 9);
  assert.equal(result.schema.skills.valid.acc, 5);
  assert.ok(result.issues.some((issue) => issue.level === 'warn' && issue.path === 'skills.percentLike.acc'));
});
