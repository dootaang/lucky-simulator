'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const innSchema = require('../../schema/yongsa-inn.v0.json');
const hunterSchema = require('../../schema/generic-combat.v0.json');
const { createState } = require('../core/createState.js');
const { createRng } = require('../core/rng.js');
const { ModuleRegistry } = require('../core/moduleRegistry.js');
const { createStatsModule } = require('../core/modules/stats.js');
const { createInventoryModule } = require('../core/modules/inventory.js');
const { createCombatModule } = require('../core/modules/combat.js');
const { availableActions, tierOf, usableItems } = require('../core/selectors.js');

function extractedRegistry() {
  return new ModuleRegistry()
    .register(createStatsModule())
    .register(createInventoryModule())
    .register(createCombatModule());
}

test('extracted modules run without installing the legacy inn module', () => {
  const registry = extractedRegistry();

  const innState = createState(innSchema);
  const affinity = registry.dispatch(innSchema, innState, { id: 'scale_delta', params: { scale: 'affinity', target: 'silvia', size: 'S', direction: '+' } }, createRng(1));
  assert.equal(affinity.log[0].ok, true);
  assert.equal(affinity.state.npcs.silvia.affinity > innState.npcs.silvia.affinity, true);

  const itemState = createState(hunterSchema);
  itemState.player.pools.hp.cur = 100;
  const item = registry.dispatch(hunterSchema, itemState, { id: 'use_item', params: { itemId: 'health_potion' } }, createRng(1));
  assert.equal(item.log[0].ok, true);
  assert.equal(item.state.resources.health_potion, 2);

  const combatState = createState(hunterSchema);
  const combat = registry.dispatch(hunterSchema, combatState, { id: 'start_encounter', params: { enemies: [{ name: '고블린', hp: 30 }] } }, createRng(1));
  assert.equal(combat.log[0].ok, true);
  assert.equal(combat.state.combat.active, true);

  assert.equal(registry.dispatch(innSchema, innState, { id: 'checkin', params: {} }, createRng(1)).log[0].reason, 'unknown_event');
});

test('extracted selector routes return the existing view models', () => {
  const registry = extractedRegistry();
  const hunterState = createState(hunterSchema);
  assert.deepEqual(registry.select('inventory/usable-items', hunterSchema, hunterState), usableItems(hunterSchema, hunterState));
  hunterState.combat = { active: true, cleared: false, fled: false, enemies: [] };
  assert.deepEqual(registry.select('combat/available-actions', hunterSchema, hunterState), availableActions(hunterSchema, hunterState));
  assert.deepEqual(registry.select('stats/tier', innSchema, 'affinity', 50), tierOf(innSchema, 'affinity', 50));
});
