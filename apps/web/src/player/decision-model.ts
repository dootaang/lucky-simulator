// 결정 카드 모델 — "지금 엔진이 결정을 기다리는 것"을 채팅 흐름 안 캡슐로 만든다(조종석 ②).
// 실제 선택지는 엔진만 제시한다(ADR 0002 §5): 여기의 모든 옵션은 셀렉터가 available이라고 판정한
// 엔진 이벤트뿐이며, LLM 서사에 등장하는 가짜 선택지와 시각적으로 구분되는 서명(★)을 단다.
// 카드가 해소되면(상태 변화) 캡슐은 사라지고 사실 영수증·서사가 기록으로 남는다.
import type { SimulationActionMode } from './simulation-action';

export interface DecisionOption { label: string; id: string; params: Record<string, unknown>; mode: SimulationActionMode; kind: 'primary' | 'ghost'; intent?: string }
export interface DecisionCardModel { key: string; icon: 'alert' | 'star' | 'bed' | 'heart'; title: string; desc: string; options: DecisionOption[]; more: string; dismissible?: boolean }

const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function safeSelect(select: (id: string) => unknown, id: string): unknown {
  try { return select(id); } catch { return null; } // 미등록 셀렉터(타 장르·순수 채팅)는 결정 없음으로 취급
}

// 티어 승급 = 서사 이벤트(조종석 슬라이스 5). 직전 턴 로그의 tierChanged 승급을 "특별한 장면" 제안 카드로.
// 발생 시점은 엔진이, 장면 내용은 LLM이 — 이 제품의 분업 그대로. 강등은 카드 없이 경고 칩만(대칭 설계).
function tierCards(logs: ReadonlyArray<Record<string, unknown>>, turn: number, nameFor: (id: string) => string): DecisionCardModel[] {
  const cards: DecisionCardModel[] = [];
  for (const log of logs) {
    if (log.ok !== true || log.event !== 'scale_delta') continue;
    const tier = rec(log.tierChanged), from = rec(tier.from), to = rec(tier.to);
    if (!to.label) continue;
    const range = (v: unknown) => (Array.isArray(v) ? v : []);
    const fromStart = num(range(from.range)[0], Number.NaN), toStart = num(range(to.range)[0], Number.NaN);
    if (Number.isFinite(fromStart) && Number.isFinite(toStart) && toStart <= fromStart) continue; // 강등은 칩만
    const target = String(log.target ?? ''), name = nameFor(target) || target, label = String(to.label);
    cards.push({ key: `tier:${turn}:${target}:${label}`, icon: 'heart', title: '관계가 깊어졌다', desc: `${name}: ${String(from.label ?? '')} → ${label}${to.brief ? ` — ${String(to.brief)}` : ''}`, more: '', dismissible: true,
      options: [{ label: '특별한 장면 열기', id: 'tier_scene', params: {}, mode: 'scene', kind: 'primary', intent: `${name}와의 관계가 방금 '${label}' 단계에 접어들었다. 그 변화가 서로에게 느껴지는 특별한 장면을 짧게 열어라.` }] });
  }
  return cards;
}

export interface DecisionContext { logs?: ReadonlyArray<Record<string, unknown>>; turn?: number; nameFor?: (id: string) => string }

export function buildDecisionCards(select: (id: string) => unknown, context: DecisionContext = {}): DecisionCardModel[] {
  const cards: DecisionCardModel[] = tierCards(context.logs ?? [], context.turn ?? 0, context.nameFor ?? ((id) => id));
  const traffic = rec(safeSelect(select, 'inn/traffic'));
  if (!Object.keys(traffic).length) return cards;
  const incident = rec(traffic.incident);
  if (Object.keys(incident).length) {
    cards.push({ key: `incident:${String(incident.id)}`, icon: 'alert', title: String(incident.label ?? '돌발 사건'), desc: String(incident.desc ?? ''), more: '',
      options: arr(incident.choices).map((choice) => ({ label: String(choice.label ?? choice.id), id: 'incident_choice', params: { choice: String(choice.id) }, mode: 'narrated' as const, kind: 'primary' as const })) });
    return cards; // 사건이 대기 중이면 다른 결정은 엔진이 어차피 잠근다 — 카드도 하나만 보여 혼선을 막는다.
  }
  const wave = arr(traffic.waves).find((item) => item.available);
  if (wave) cards.push({ key: `wave:${String(wave.id)}`, icon: 'star', title: `${String(wave.label ?? wave.id)} 대기`, desc: '', more: '',
    options: [{ label: '영업 시작', id: 'traffic_wave', params: { wave: String(wave.id) }, mode: 'narrated', kind: 'primary' }, { label: '건너뛰기', id: 'traffic_wave', params: { wave: String(wave.id), skip: true }, mode: 'ledger', kind: 'ghost' }] });
  const lodging = arr(traffic.lodging);
  const request = lodging[0];
  if (request) {
    const party = num(request.party, 1), stay = num(request.stayDays, 1), revenue = num(request.revenue);
    cards.push({ key: `lodging:${String(request.id)}`, icon: 'bed', title: `숙박 문의 · ${String(request.guestName ?? '손님')} 일행 ${party}명 · ${stay}박`, desc: request.available ? (revenue ? `수락 시 +${revenue.toLocaleString()}원 (${String(request.roomNo)}호)` : '') : String(request.reason ?? ''), more: lodging.length > 1 ? `외 ${lodging.length - 1}건은 관리 화면에서` : '',
      options: [...(request.available ? [{ label: '수락', id: 'lodging_accept', params: { requestId: String(request.id) }, mode: 'narrated' as const, kind: 'primary' as const }] : []), { label: '거절', id: 'lodging_reject', params: { requestId: String(request.id) }, mode: 'narrated' as const, kind: 'ghost' as const }] });
  }
  return cards;
}
