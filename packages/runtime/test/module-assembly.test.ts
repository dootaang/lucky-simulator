import { describe, expect, it } from 'vitest';
import { createHunterRegistry, createInnRegistry, MODULE_CATALOG } from '@simbot/modules';
import { ProjectRuntime, registryFor, type RuntimeProject } from '../src/index.ts';

const project=(moduleIds:string[]):RuntimeProject=>({projectId:'assembly',moduleIds,schema:{rpgQuests:[{id:'first',steps:[]}],initialState:{day:1,questProgress:{}}},screens:[],navigation:[],content:{},featureToggles:{}});

describe('module id assembly',()=>{
  it('catalogs every declared built-in module id',()=>{expect(Object.keys(MODULE_CATALOG).sort()).toEqual(['combat.turnbased','core.equipment','core.factions','core.inventory','core.jobs','core.location','core.progression','core.stats','core.time','genre.hunter','genre.inn','genre.inn.traffic','rpg.crafting','rpg.loot','rpg.party','rpg.quests','rpg.shop']);});
  it('dispatches quests without registering combat',()=>{const runtime=new ProjectRuntime(project(['rpg.quests']));expect(runtime.dispatch('quest/start',{questId:'first'}).log[0]).toMatchObject({ok:true,event:'quest/start'});expect(runtime.registry.hasEvent('start_encounter')).toBe(false);});
  it('keeps explicit chat mode empty',()=>{const runtime=new ProjectRuntime(project([]));expect(runtime.registry.eventIds()).toEqual([]);});
  it('preserves the legacy inn event set',()=>{expect(registryFor(project(['genre.inn'])).registry.eventIds().sort()).toEqual(createInnRegistry().eventIds().sort());});
  it('preserves the legacy hunter event set',()=>{expect(registryFor(project(['genre.hunter'])).registry.eventIds().sort()).toEqual(createHunterRegistry().eventIds().sort());});
  it('reports unknown ids without crashing',()=>{const result=registryFor(project(['unknown.card.module']));expect(result.unknownModuleIds).toEqual(['unknown.card.module']);expect(result.registry.eventIds()).toEqual([]);});
});
