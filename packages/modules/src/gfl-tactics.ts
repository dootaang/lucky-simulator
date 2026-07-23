import type { RuntimeRecord } from '@simbot/kernel';
import { list, number, record, string } from './support.ts';

export type Doll = RuntimeRecord & { id: string; name: string; class: string; grade: number; maxHp: number; power: number; maxMp?: number; mood?: number };
export type FormationRow = '전열' | '중열' | '후열';
export type CombatSkill = { cost: number; round: number; effect: string };

const CLASS_COMBAT: Record<string, { aggro: number; damageTaken: number; vsMaxHp?: number; round1?: number; round3plus?: number; hitBuffAlly?: number; illumination?: number; skill?: CombatSkill }> = {
  AR: { aggro: 1, damageTaken: 1, skill: { cost: 240, round: 2, effect: 'double_attack' } },
  SMG: { aggro: 3, damageTaken: .68, skill: { cost: 180, round: 1, effect: 'draw_fire' } },
  SG: { aggro: 4, damageTaken: .6, skill: { cost: 180, round: 1, effect: 'fortify' } },
  MG: { aggro: 1, damageTaken: 1, round1: 1.4, round3plus: .8, skill: { cost: 240, round: 1, effect: 'opening_barrage' } },
  RF: { aggro: .5, damageTaken: 1, vsMaxHp: 1.3, skill: { cost: 300, round: 2, effect: 'sure_critical' } },
  HG: { aggro: .5, damageTaken: 1, hitBuffAlly: 1, illumination: 2, skill: { cost: 180, round: 1, effect: 'command_buff' } },
  BOSS: { aggro: 1.5, damageTaken: .9 },
};

export const ROW_AGGRO: Record<FormationRow, number> = { 전열: 2.4, 중열: 1, 후열: .4 };
export const REAR_DAMAGE_BONUS = 1.38;
export const COMMANDER_EXP_BY_STAR = [10, 15, 20, 30, 40, 55, 70] as const;
export const commanderThreshold = (level: number) => 30 + 20 * (level - 1);
export const COMMANDER_LEVELS = Array.from({ length: 20 }, (_, index) => {
  const level = index + 1; let exp = 0;
  for (let current = 1; current < level; current++) exp += commanderThreshold(current);
  return { level, exp, expForNext: level < 20 ? commanderThreshold(level) : null };
});
export function commanderLevel(exp: number) { const total = Math.max(0, number(exp)); let level = 1; for (const entry of COMMANDER_LEVELS) if (total >= entry.exp) level = entry.level; return level; }
export const commanderSortieLimit = (level: number) => level >= 12 ? 5 : level >= 4 ? 4 : 3;
export const commanderCheckBonus = (level: number) => level >= 16 ? 2 : level >= 8 ? 1 : 0;
export function commanderStatus(value: RuntimeRecord) {
  const player = record(value.player), exp = Math.max(0, number(player.exp)), level = commanderLevel(exp), current = COMMANDER_LEVELS[level - 1]!;
  return { level, exp, expIntoLevel: exp - current.exp, expForNext: current.expForNext, sortieLimit: commanderSortieLimit(level), checkBonus: commanderCheckBonus(level), title: level >= 20 ? '백전의 지휘관' : null };
}

export const FACTION_COUNTER: Record<string, { advantaged: string[]; label: string; badge: string }> = {
  철혈: { advantaged: ['RF', 'MG'], label: '기계 장갑 부대 — RF·MG 유리', badge: '⚙' },
  'E.L.I.D': { advantaged: ['MG', 'SG', 'AR'], label: '감염 군집 — MG·SG·AR 유리', badge: '☣' },
  바랴그단: { advantaged: [], label: '적성 인형 부대 — 상성 중립', badge: '🎯' },
  패러데우스: { advantaged: ['SG', 'SMG'], label: '정예 화력 — 방패 병과 가치 상승', badge: '⬡' },
};
export const FORMATION_GUIDE = Object.fromEntries(Object.entries(CLASS_COMBAT).filter(([name]) => name !== 'BOSS').map(([name, profile]) => [name, profile.damageTaken < 1 ? '전열' : profile.round1 || profile.round3plus || profile.vsMaxHp ? '후열' : '중열'])) as Record<string, FormationRow>;
export const combatProfile = (className: unknown) => CLASS_COMBAT[string(className)] ?? CLASS_COMBAT.AR!;
export const FORMATION_SIZE = 6;
export function gflSealMigration(value: RuntimeRecord) { const gfl = record(value.gfl); for (const raw of list<RuntimeRecord>(gfl.echelons)) { if (!Array.isArray(raw.slots) || raw.slots.length >= FORMATION_SIZE) continue; const slots = [...raw.slots]; while (slots.length < FORMATION_SIZE) slots.push(null); raw.slots = slots; } return value; }
export const gflFormationRow = (index: number): FormationRow => index < 2 ? '전열' : index < 4 ? '중열' : '후열';
export function factionSummary(value: RuntimeRecord) { const factions = list<string>(value.factions), counters = factions.map((name) => FACTION_COUNTER[name]).filter((counter): counter is NonNullable<typeof counter> => Boolean(counter)), advantagedClasses = [...new Set(counters.flatMap((counter) => counter.advantaged))]; return { factions, counterLabel: counters.map((counter) => counter.label).join(' / '), advantagedClasses }; }
