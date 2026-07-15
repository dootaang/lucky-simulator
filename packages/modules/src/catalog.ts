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

export interface ScreenPresetBundle {
  screens: Record<string, unknown>[];
  navigation: Record<string, unknown>[];
}

/** Default declarative screens owned by built-in genre modules. */
export function screenPresetsFor(moduleIds: string[]): ScreenPresetBundle {
  const screens: Record<string, unknown>[] = [];
  if (moduleIds.includes('genre.inn')) {
    screens.push({ id:'management', title:'여관 경영', layout:'dashboard', regions:{ main:[{ widget:'inn-management' }] } });
  }
  if (moduleIds.includes('genre.hunter')) {
    screens.push(
      { id:'hunter-hq', title:'헌터 협회', layout:'dashboard', regions:{ hud:[{ widget:'detail-panel', title:'헌터 상태', source:'engine:hunter/status' }], main:[{ widget:'decision-card', cardTitle:'헌터 등록과 평가', actions:[{ id:'register', label:'헌터 등록', mode:'ledger', event:{ id:'hunter/register', params:{ name:'신규 헌터' } } },{ id:'assess', label:'등급 평가', mode:'ledger', event:{ id:'hunter/assess', params:{} } }] }] } },
      { id:'hunter-gates', title:'게이트', layout:'dashboard', regions:{ main:[{ widget:'card-list', title:'게이트 목록', source:'engine:hunter/gates', selectionKey:'gateId' }], actions:[{ widget:'action-group', title:'게이트 작전', actions:[{ id:'accept', label:'게이트 수락', mode:'ledger', event:{ id:'hunter/gate-accept', params:{ gateId:{ $path:'selection.gateId' } } } },{ id:'raid', label:'게이트 공략', mode:'ledger', event:{ id:'hunter/gate-raid', params:{ gateId:{ $path:'selection.gateId' } } } },{ id:'clear', label:'클리어 보고', mode:'ledger', event:{ id:'hunter/gate-clear', params:{ gateId:{ $path:'selection.gateId' } } } },{ id:'settle', label:'정산', mode:'ledger', event:{ id:'hunter/settle', params:{ gateId:{ $path:'selection.gateId' } } } }] }] } },
      { id:'hunter-party', title:'파티', layout:'dashboard', regions:{ main:[{ widget:'detail-panel', title:'파티 편성', source:'engine:party/formation' }], actions:[{ widget:'action-group', title:'파티 관리', actions:[{ id:'party-add', label:'동료 영입', mode:'ledger', event:{ id:'party/add', params:{ memberId:{ $path:'schema.entities.0.instances.0.id' } } } }] }] } },
    );
  }
  return {
    screens,
    navigation: screens.map((screen) => ({ id:screen.id, screenId:screen.id, label:screen.title })),
  };
}
