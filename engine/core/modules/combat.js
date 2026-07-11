'use strict';

const { startEncounter, combatAction, enemyAction, enemyTurn, endEncounter } = require('../combat.js');
const { availableActions } = require('../selectors.js');
const { scopedEvent } = require('./eventSupport.js');

function createCombatModule() {
  return {
    id: 'combat.turnbased',
    version: '1.0.0',
    dependencies: ['core.stats', 'core.inventory'],
    stateAccess: {
      owns: ['combat'],
      reads: ['player.*'],
      writes: ['player.*', 'gold', 'pendingQuest.cleared'],
    },
    events: {
      start_encounter: scopedEvent(({ schema, state, params, rng, ok, fail }) => startEncounter(schema, state, params, rng, ok, fail)),
      combat_action: scopedEvent(({ schema, state, params, rng, ok, fail }) => combatAction(schema, state, params, rng, ok, fail)),
      enemy_action: scopedEvent(({ schema, state, params, rng, ok, fail }) => enemyAction(schema, state, params, rng, ok, fail)),
      enemy_turn: scopedEvent(({ schema, state, params, rng, ok, fail }) => enemyTurn(schema, state, params, rng, ok, fail)),
      end_encounter: scopedEvent(endEncounterEvent),
    },
    selectors: {
      'combat/available-actions': availableActions,
    },
    processes: {},
    migrations: {},
  };
}

function endEncounterEvent({ schema, state, params, rng, ok, fail }) {
  const combatQuestId = state.combat && state.combat.questId;
  const result = endEncounter(schema, state, params, rng, ok, fail);
  const logEntry = result.log && result.log[0];
  if (logEntry && logEntry.ok && logEntry.outcome === 'victory'
    && result.state.pendingQuest && result.state.pendingQuest.questId === combatQuestId) {
    result.state.pendingQuest.cleared = true;
  }
  return result;
}

module.exports = { createCombatModule };
