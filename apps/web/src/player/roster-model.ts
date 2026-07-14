// NPC 로스터 모델 — 스키마 NPC 목록을 "만난 인물 + 카드가 정의한 티어 + 엔진 사실 태그"로 요약한다.
// 공개 규칙: "엔진은 다 알지만 화면은 겪은 만큼만" — 만나지 않은 NPC는 실루엣(???)으로만 보이고,
// 사용자가 '전부 공개'를 켜면 해제된다(SPEC-COCKPIT-DESIGN 확정). 티어 이름·구간은 카드 정의를 그대로 쓴다.

export interface RosterLadder { scaleId: string; label: string; value: number; tierMin: number; tierMax: number; next: number | null; brief?: string }
export interface RosterRow { id: string; name: string; met: boolean; tags: string[]; ladder: RosterLadder | null }

const own = (o: unknown, k: string) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const num = (v: unknown, fallback = Number.NaN) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// per-NPC 스케일 = tiers를 가진 첫 스케일(관례상 affinity). 없으면 로스터는 이름·태그만 보여준다.
function npcScale(schema: Record<string, unknown>) {
  return arr(rec(schema).scales).map(rec).find((scale) => arr(scale.tiers).length) ?? null;
}
function tierOf(scale: Record<string, unknown>, value: number) {
  return arr(scale.tiers).map(rec).find((tier) => { const range = arr(tier.range); return value >= num(range[0]) && value <= num(range[1]); }) ?? null;
}

// 정규화된 스키마의 entities는 배열([{type:'npc',instances:[{id,…}]}])이고, 정규화 전 원본은 맵일 수 있다. 둘 다 수용한다.
function npcInstances(schema: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const entities = rec(schema).entities;
  if (Array.isArray(entities)) { const block = entities.map(rec).find((entry) => entry.type === 'npc'); return arr(block?.instances).map(rec).map((item) => [String(item.id ?? ''), item] as [string, Record<string, unknown>]).filter(([id]) => id); }
  return Object.entries(rec(rec(rec(entities).npc).instances)).map(([id, value]) => [id, rec(value)]);
}

export function buildRosterModel(schema: Record<string, unknown>, state: Record<string, unknown>, metIds: ReadonlySet<string>, revealAll = false): RosterRow[] {
  const npcState = rec(state.npcs), staff = arr(state.staff).map(rec);
  const scale = npcScale(schema);
  const rows: RosterRow[] = [];
  for (const [id, definition] of npcInstances(schema)) {
    const hired = staff.find((member) => member.npcId === id || member.id === id);
    const met = revealAll || metIds.has(id) || !!hired; // 고용은 엔진 사실 — 만난 것으로 친다
    const name = String(definition.nameKo ?? definition.nameEn ?? definition.label ?? id);
    const tags: string[] = [];
    if (hired) tags.push(`고용중${num(hired.dailyWage) ? ` · 일급 ${num(hired.dailyWage).toLocaleString()}원` : ''}`);
    let ladder: RosterLadder | null = null;
    if (met && scale && own(npcState, id)) {
      const value = num(rec(npcState[id])[String(scale.id ?? 'affinity')], num(scale.default, 0));
      const tier = tierOf(scale, value);
      if (tier) {
        const range = arr(tier.range), tierMax = num(range[1]);
        ladder = { scaleId: String(scale.id ?? 'affinity'), label: String(tier.label ?? ''), value, tierMin: num(range[0]), tierMax, next: value < tierMax ? tierMax + 1 - value : null, ...(tier.brief ? { brief: String(tier.brief) } : {}) };
      }
    }
    rows.push({ id, name: met ? name : '???', met, tags: met ? tags : [], ladder });
  }
  // 만난 인물 먼저, 그 안에서는 호감도 높은 순 — 도감의 진행감을 준다.
  return rows.sort((a, b) => Number(b.met) - Number(a.met) || (b.ladder?.value ?? -1) - (a.ladder?.value ?? -1));
}

// 세션 메시지의 화자 기록에서 "만난 NPC" 집합을 만든다(엔진 사건 이력이 곧 도감이다).
export function collectMetIds(messages: ReadonlyArray<{ speakers?: ReadonlyArray<{ npcId?: unknown }> | undefined }>): Set<string> {
  const met = new Set<string>();
  for (const message of messages) for (const speaker of message.speakers ?? []) if (typeof speaker?.npcId === 'string' && speaker.npcId) met.add(speaker.npcId);
  return met;
}
