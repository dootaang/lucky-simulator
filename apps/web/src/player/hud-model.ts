// 계기판 HUD 모델 — 엔진 상태를 "시계·지갑(고정) + 게이지(가로 스크롤)" 칩으로 요약한다.
// 카드별 분기 금지: 스키마의 `hud` 선언이 있으면 그대로 따르고(컴파일러가 채울 그릇),
// 없으면 상태의 표준 키(day/gold/resources/pools/reputation/level)에서 보수적으로 유도한다.
// 슬롯이 0개면 HUD 자체를 그리지 않는다(3모드 원칙 — 순수 로어 카드는 리스 화면 그대로).

export interface HudChip { id: string; label: string; value: string }
export interface HudModel { fixed: HudChip[]; gauges: HudChip[] }

const own = (o: unknown, k: string) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// 알려진 자원 키만 한글화 — 미지 키는 원문 유지(카드 지식을 하드코딩하지 않는다).
const RESOURCE_LABELS: Record<string, string> = { food: '식자재', drink: '주류', material: '재료' };

// 스키마 hud 선언: [{slot:'clock'|'wallet'|'gauge', label, path, suffix?}] — path는 own-property로만 내려간다.
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
function readPath(state: Record<string, unknown>, path: string): unknown {
  let cur: unknown = state;
  for (const part of String(path).split('.')) { if (UNSAFE.has(part) || !own(cur, part)) return undefined; cur = (cur as Record<string, unknown>)[part]; }
  return cur;
}
function declared(hud: unknown, state: Record<string, unknown>): HudModel | null {
  if (!Array.isArray(hud) || !hud.length) return null;
  const model: HudModel = { fixed: [], gauges: [] };
  for (const [index, raw] of hud.entries()) {
    const item = rec(raw), value = readPath(state, String(item.path ?? ''));
    if (value === undefined || value === null) continue;
    const text = typeof value === 'number' ? value.toLocaleString() : String(value);
    const chip: HudChip = { id: `hud:${index}`, label: String(item.label ?? item.path ?? ''), value: `${text}${item.suffix ? String(item.suffix) : ''}` };
    (item.slot === 'clock' || item.slot === 'wallet' ? model.fixed : model.gauges).push(chip);
  }
  return model.fixed.length + model.gauges.length ? model : null;
}

export function buildHudModel(schema: Record<string, unknown>, state: Record<string, unknown>): HudModel {
  const fromSchema = declared(rec(schema).hud, state);
  if (fromSchema) return fromSchema;
  const model: HudModel = { fixed: [], gauges: [] };
  const day = num(state.day); if (day !== null) model.fixed.push({ id: 'clock', label: '일차', value: own(state, 'time') ? `${day} · ${String(state.time)}` : String(day) });
  const gold = num(state.gold); if (gold !== null) model.fixed.push({ id: 'wallet', label: '골드', value: gold.toLocaleString() });
  const resources = rec(state.resources);
  for (const key of Object.keys(resources).slice(0, 3)) { const v = num(resources[key]); if (v !== null) model.fixed.push({ id: `res:${key}`, label: RESOURCE_LABELS[key] ?? key, value: v.toLocaleString() }); }
  const pools = rec(rec(state.player).pools);
  for (const key of Object.keys(pools)) { const pool = rec(pools[key]), cur = num(pool.current ?? pool.value), max = num(pool.max); if (cur !== null) model.gauges.push({ id: `pool:${key}`, label: key.toUpperCase(), value: max !== null ? `${cur}/${max}` : String(cur) }); }
  const level = num(rec(state.player).level); if (level !== null) model.gauges.push({ id: 'level', label: 'Lv', value: String(level) });
  const reputation = rec(state.reputation); const axes = Object.keys(reputation).map((k) => num(reputation[k])).filter((v): v is number => v !== null);
  if (axes.length) model.gauges.push({ id: 'reputation', label: '평판', value: axes.reduce((a, b) => a + b, 0).toLocaleString() });
  const location = state.location; if (typeof location === 'string' && location) model.gauges.push({ id: 'location', label: '위치', value: location });
  return model;
}
