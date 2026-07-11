'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const innSchema = require('../../schema/yongsa-inn.v0.json');
const hunterSchema = require('../../schema/generic-combat.v0.json');
const innFixture = require('./fixtures/hero-inn.workflow.json');
const hunterFixture = require('./fixtures/generic-combat.workflow.json');
const { createState } = require('../core/createState.js');
const { createRng } = require('../core/rng.js');
const { applyEvent } = require('../core/applyEvent.js');

const schemas = { 'yongsa-inn.v0.json': innSchema, 'generic-combat.v0.json': hunterSchema };

for (const fixture of [innFixture, hunterFixture]) {
  test(`${fixture.name} representative workflow remains byte-stable`, () => {
    const schema = schemas[fixture.schema];
    let state = createState(schema, fixture.seed);
    if (fixture.initial && fixture.initial.playerHp != null) state.player.pools.hp.cur = fixture.initial.playerHp;
    const rng = createRng(fixture.seed);
    const logs = [];
    for (const event of fixture.events) {
      const result = applyEvent(schema, state, event, rng);
      logs.push({ event, log: result.log });
      if (result.log.some((entry) => entry.ok)) state = result.state;
    }
    assert.equal(sha256(state), fixture.expected.stateSha256);
    assert.equal(sha256(logs), fixture.expected.logsSha256);
    assert.deepEqual(summary(fixture.name, state), fixture.expected.summary);
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function summary(name, state) {
  if (name === 'hero-inn') return {
    day: state.day,
    gold: state.gold,
    food: state.resources.food,
    drink: state.resources.drink,
    staff: state.staff.length,
    room106: state.rooms['106'],
    silviaAffinity: state.npcs.silvia.affinity,
  };
  return {
    gold: state.gold,
    level: state.player.level,
    exp: state.player.exp,
    hp: state.player.pools.hp,
    healthPotion: state.resources.health_potion,
    combat: state.combat,
  };
}
