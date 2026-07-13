import type { ModuleDefinition } from '@simbot/kernel';
import { craftingModule, equipmentModule, questsModule, shopModule } from './advanced.ts';
import { combatModule } from './combat.ts';
import {
  factionsModule,
  inventoryModule,
  jobsModule,
  locationModule,
  lootModule,
  partyModule,
  progressionModule,
  timeModule,
} from './common.ts';
import { hunterModule } from './hunter.ts';
import { innTrafficModule } from './inn-traffic.ts';
import { innModule } from './inn.ts';
import { statsModule } from './stats.ts';

/** Every built-in module named by the compiler and SimPack manifest. */
export const MODULE_CATALOG: Record<string, () => ModuleDefinition> = {
  'core.stats': statsModule,
  'core.inventory': inventoryModule,
  'core.equipment': equipmentModule,
  'core.progression': progressionModule,
  'core.jobs': jobsModule,
  'core.location': locationModule,
  'core.time': timeModule,
  'core.factions': factionsModule,
  'rpg.quests': questsModule,
  'rpg.shop': shopModule,
  'rpg.crafting': craftingModule,
  'rpg.loot': lootModule,
  'rpg.party': partyModule,
  'combat.turnbased': combatModule,
  'genre.inn': innModule,
  'genre.inn.traffic': innTrafficModule,
  'genre.hunter': hunterModule,
};
