import { describe, expect, it } from 'vitest';
import { buildDecisionCards } from './decision-model';

const selectFrom = (traffic: unknown) => (id: string) => (id === 'inn/traffic' ? traffic : null);

describe('결정 카드 모델', () => {
  it('소녀전선 출격 직후 채팅 안에 빠른 교전 버튼을 고정한다', () => {
    const cards = buildDecisionCards((id) => id === 'gfl/status' ? { sortie: { active: true, missionId: 'alpha', echelonId: 'e1', power: 1800 } } : null);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: 'gfl-sortie:alpha:e1', title: '작전 출격 완료 · 교전 대기 중', more: 'LLM 전투 계산 0회' });
    expect(cards[0]!.options[0]).toMatchObject({ label: '빠른 교전 시작', id: 'gfl/sortie/resolve', mode: 'narrated' });
  });
  it('대기 중인 첫 영업 파동을 영업 시작(서사)·건너뛰기(장부) 카드로 만든다', () => {
    const cards = buildDecisionCards(selectFrom({ waves: [{ id: 'lunch', label: '점심 영업', available: false, reason: '완료' }, { id: 'dinner', label: '저녁 영업', available: true }], incident: null, lodging: [] }));
    expect(cards).toHaveLength(1);
    expect(cards[0]!).toMatchObject({ key: 'wave:dinner', title: '저녁 영업 대기' });
    expect(cards[0]!.options.map((option) => `${option.label}:${option.mode}`)).toEqual(['영업 시작:narrated', '건너뛰기:ledger']);
    expect(cards[0]!.options[1]!.params).toEqual({ wave: 'dinner', skip: true });
  });
  it('사건이 대기 중이면 사건 카드만 만든다 — 엔진이 나머지를 잠그기 때문', () => {
    const cards = buildDecisionCards(selectFrom({ incident: { id: 'thief', label: '좀도둑', desc: '주방을 노린다', choices: [{ id: 'chase', label: '쫓아낸다' }, { id: 'ignore', label: '모른 척한다' }] }, waves: [{ id: 'lunch', available: true }], lodging: [{ id: 'r1', available: true }] }));
    expect(cards).toHaveLength(1);
    expect(cards[0]!).toMatchObject({ icon: 'alert', title: '좀도둑', desc: '주방을 노린다' });
    expect(cards[0]!.options.map((option) => option.params.choice)).toEqual(['chase', 'ignore']);
  });
  it('숙박 문의는 첫 건을 카드로, 나머지는 관리 화면 안내로 접는다. 수용 불가면 수락 버튼이 없다', () => {
    const cards = buildDecisionCards(selectFrom({ incident: null, waves: [], lodging: [{ id: 'a', guestName: '박', party: 2, stayDays: 3, available: true, roomNo: '201', revenue: 24000 }, { id: 'b', available: false, reason: '빈 객실 없음' }] }));
    expect(cards[0]!).toMatchObject({ icon: 'bed', title: '숙박 문의 · 박 일행 2명 · 3박', desc: '수락 시 +24,000원 (201호)', more: '외 1건은 관리 화면에서' });
    const full = buildDecisionCards(selectFrom({ incident: null, waves: [], lodging: [{ id: 'b', available: false, reason: '빈 객실 없음' }] }));
    expect(full[0]!.options.map((option) => option.label)).toEqual(['거절']);
    expect(full[0]!.desc).toBe('빈 객실 없음');
  });
  it('티어 승급 로그는 특별한 장면 제안 카드가 되고, 강등은 카드를 만들지 않는다', () => {
    const up = { ok: true, event: 'scale_delta', target: 'silvia', scale: 'affinity', tierChanged: { from: { label: '신뢰', range: [81, 150] }, to: { label: '애착', range: [151, 180], brief: '감정적 의존' } } };
    const down = { ok: true, event: 'scale_delta', target: 'clem', tierChanged: { from: { label: '호의', range: [81, 110] }, to: { label: '중립', range: [51, 80] } } };
    const cards = buildDecisionCards(() => null, { logs: [up, down], turn: 7, nameFor: (id) => (id === 'silvia' ? '실비아' : id) });
    expect(cards).toHaveLength(1);
    expect(cards[0]!).toMatchObject({ key: 'tier:7:silvia:애착', icon: 'heart', title: '관계가 깊어졌다', desc: '실비아: 신뢰 → 애착 — 감정적 의존', dismissible: true });
    expect(cards[0]!.options[0]!).toMatchObject({ mode: 'scene', label: '특별한 장면 열기' });
    expect(cards[0]!.options[0]!.intent).toContain("실비아와의 관계가 방금 '애착' 단계");
  });
  it('여관 셀렉터가 없는 카드(순수 채팅·타 장르)는 빈 배열 — 캡슐 자체가 안 뜬다', () => {
    expect(buildDecisionCards(() => null)).toEqual([]);
    expect(buildDecisionCards(() => { throw new Error('unknown_selector'); })).toEqual([]);
  });
});
