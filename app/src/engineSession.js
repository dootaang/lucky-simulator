const defaultSchema = require('../../schema/yongsa-inn.v0.json');
const { createState } = require('../../engine/core/createState.js');
const { applyEvent } = require('../../engine/core/applyEvent.js');
const { createRng } = require('../../engine/core/rng.js');

let activeSchema = defaultSchema;
let seedValue = 42;
let engineState = createState(activeSchema, seedValue);
let rng = createRng(seedValue);
let logs = [];
let eventCount = 0;

export const eventTypes = [
  'checkin',
  'checkout',
  'sale',
  'purchase',
  'upgrade',
  'gain_resource',
  'hire',
  'fire',
  'scale_delta',
  'rep_event',
  'exp_gain',
  'reward',
  'gold_delta',
  'resource_delta',
  'use_item',
  'start_encounter',
  'combat_action',
  'enemy_action',
  'enemy_turn',
  'end_encounter',
  'day_end',
];

export function getSchema() {
  return activeSchema;
}

export function setActiveSchema(schema) {
  activeSchema = schema || defaultSchema;
  return resetSession(getSeed());
}

export function getEngineState() {
  return engineState;
}

export function getSeed() {
  return seedValue;
}

export function getLogs() {
  return logs;
}

export function getEventCount() {
  return eventCount;
}

export function resetSession(seed) {
  seedValue = Number.isFinite(Number(seed)) ? Number(seed) : 42;
  engineState = createState(activeSchema, seedValue);
  rng = createRng(seedValue);
  logs = [];
  eventCount = 0;
  return engineState;
}

export function runEvent(event) {
  const result = applyEvent(activeSchema, engineState, event, rng);
  if (result.log.some((entry) => entry.ok)) engineState = result.state;
  eventCount += 1;
  const item = { event, entries: result.log, index: logs.length + 1 };
  logs.unshift(item);
  return item;
}

export function summarizeEvent(type, entry, formatMoney) {
  if (entry.ok && type === 'use_item') {
    const def = ((activeSchema && activeSchema.resources) || []).find((resource) => resource.id === entry.itemId);
    return `🧪 ${(def && def.label) || entry.itemId} · ${String(entry.pool).toUpperCase()} +${entry.amount} (남은 ${entry.remaining})`;
  }
  if (entry.ok && type === 'reward') return `reward · ${entry.tier} · gold +${formatMoney(entry.goldDelta)}`;
  if (entry.ok && type === 'upgrade') return `upgrade · ${entry.facility} Lv.${entry.level} · gold ${entry.goldDelta >= 0 ? '+' : ''}${formatMoney(entry.goldDelta)}`;
  if (entry.ok && type === 'gain_resource') return `gain · ${entry.resource} +${entry.qty} (${entry.scale})`;
  if (!entry.ok) return `${type} 실패: ${entry.reason || '알 수 없음'}${entry.detail ? ` (${entry.detail})` : ''}`;
  if (type === 'start_encounter') return `전투 시작 · 적 ${(entry.enemies || []).length}`;
  if (type === 'combat_action') {
    if (entry.action === 'defend') return '방어 태세';
    if (entry.action === 'flee') return `도주 ${entry.fled ? '성공' : '실패'}`;
    return `${entry.skill || '공격'} · ${entry.target} ${entry.hit ? (entry.tier === 'critical_success' ? '크리티컬' : '명중') : '빗나감'} · 피해 ${entry.damage}${entry.cleared ? ' · 전멸' : ''}`;
  }
  if (type === 'enemy_action') return `${entry.enemyId} 반격 · ${entry.hit ? `피해 ${entry.damage}` : '회피'}${entry.playerDead ? ' · 플레이어 전투불능' : ''}`;
  if (type === 'end_encounter') return `전투 종료(${entry.outcome}) · EXP +${entry.expGained} · 골드 +${formatMoney(entry.goldGained)}${entry.levelUps && entry.levelUps.length ? ` · Lv.${entry.levelUps.join(',')}` : ''}`;
  if (type === 'scale_delta') return entry.capped ? `${entry.target} capped · ${entry.before} -> ${entry.after}` : `${entry.target} ${entry.before} -> ${entry.after}`;
  if (type === 'rep_event') return `${entry.axis}/${entry.category} ${entry.before.rank}(${entry.before.exp}) -> ${entry.after.rank}(${entry.after.exp}), delta ${entry.delta}`;
  if (type === 'day_end') return `하루 마감 · ${entry.report.day}일차 정산`;
  if (type === 'sale') {
    const cost = entry.consumed ? Object.entries(entry.consumed).map(([r, n]) => ` · ${r} -${n}`).join('') : '';
    return `sale · ${entry.menuName || ''} · gold +${formatMoney(entry.goldDelta)}${cost}`;
  }
  if (entry.goldDelta != null) return `${type} · gold ${entry.goldDelta >= 0 ? '+' : ''}${formatMoney(entry.goldDelta)}`;
  return `${type} 실행`;
}
