import { describe, expect, it } from 'vitest';
import { buildRosterModel, collectMetIds } from './roster-model';

const schema = { entities: { npc: { instances: { silvia: { nameKo: '실비아' }, adelaine: { nameKo: '아델라인' }, clem: { nameKo: '클렘' } } } }, scales: [{ id: 'affinity', default: 60, tiers: [{ range: [0, 80], label: '중립', brief: '계산적' }, { range: [81, 150], label: '신뢰', brief: '깊은 유대' }] }] };

describe('NPC 로스터 모델', () => {
  it('만난 NPC는 카드가 정의한 티어 이름·다음 문턱과 함께, 안 만난 NPC는 실루엣으로 나온다', () => {
    const rows = buildRosterModel(schema, { npcs: { silvia: { affinity: 132 }, adelaine: { affinity: 10 }, clem: {} } }, new Set(['silvia']));
    const silvia = rows.find((row) => row.id === 'silvia')!;
    expect(silvia).toMatchObject({ name: '실비아', met: true });
    expect(silvia.ladder).toMatchObject({ label: '신뢰', value: 132, tierMax: 150, next: 19, brief: '깊은 유대' });
    expect(rows.find((row) => row.id === 'adelaine')).toMatchObject({ name: '???', met: false, ladder: null });
    expect(rows[0]?.id).toBe('silvia'); // 만난 인물이 먼저
  });
  it('고용은 엔진 사실이므로 만난 것으로 치고 태그를 붙인다', () => {
    const rows = buildRosterModel(schema, { npcs: { clem: { affinity: 60 } }, staff: [{ npcId: 'clem', dailyWage: 800 }] }, new Set());
    expect(rows.find((row) => row.id === 'clem')).toMatchObject({ name: '클렘', met: true, tags: ['고용중 · 일급 800원'] });
  });
  it('전부 공개를 켜면 실루엣이 해제된다 (제작자·사용자 토글)', () => {
    const rows = buildRosterModel(schema, { npcs: {} }, new Set(), true);
    expect(rows.every((row) => row.met)).toBe(true);
    expect(rows.map((row) => row.name)).toContain('아델라인');
  });
  it('티어 스케일이 없는 카드는 이름·태그만 다룬다 (범용 안전)', () => {
    const rows = buildRosterModel({ entities: { npc: { instances: { a: { nameKo: '가' } } } } }, {}, new Set(['a']));
    expect(rows[0]!).toMatchObject({ name: '가', ladder: null });
  });
  it('정규화된 배열형 entities([{type,instances:[{id}]}])도 읽는다', () => {
    const rows = buildRosterModel({ entities: [{ type: 'npc', instances: [{ id: 'silvia', nameKo: '실비아' }] }], scales: schema.scales }, { npcs: { silvia: { affinity: 132 } } }, new Set(['silvia']));
    expect(rows[0]!).toMatchObject({ id: 'silvia', name: '실비아' });
    expect(rows[0]!.ladder).toMatchObject({ label: '신뢰', value: 132 });
  });
  it('메시지 화자 기록에서 만난 집합을 만든다', () => {
    expect([...collectMetIds([{ speakers: [{ npcId: 'silvia' }] }, {}, { speakers: [{ npcId: 'clem' }, { npcId: 'silvia' }] }])]).toEqual(['silvia', 'clem']);
  });
});
