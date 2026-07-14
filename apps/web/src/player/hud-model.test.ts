import { describe, expect, it } from 'vitest';
import { buildHudModel } from './hud-model';

describe('계기판 HUD 모델', () => {
  it('여관형 상태에서 시계·지갑은 고정, 풀·평판·레벨은 게이지로 유도한다', () => {
    const model = buildHudModel({}, { day: 3, gold: 12400, resources: { food: 6, drink: 4 }, player: { level: 2, pools: { hp: { current: 90, max: 130 } } }, reputation: { village: 30, advent: 10 } });
    expect(model.fixed.map((c) => `${c.label} ${c.value}`)).toEqual(['일차 3', '골드 12,400', '식자재 6', '주류 4']);
    expect(model.gauges.map((c) => `${c.label} ${c.value}`)).toEqual(['HP 90/130', 'Lv 2', '평판 40']);
  });
  it('상태 슬롯이 하나도 없으면 빈 모델이라 HUD가 그려지지 않는다(3모드)', () => {
    const model = buildHudModel({}, { npcs: {}, staff: [] });
    expect(model.fixed).toEqual([]); expect(model.gauges).toEqual([]);
  });
  it('스키마 hud 선언이 있으면 표준 유도 대신 선언을 따르고, own-property 경로만 읽는다', () => {
    const state = JSON.parse('{"day":5,"custom":{"불만도":12},"__proto__":{"evil":1}}');
    const model = buildHudModel({ hud: [{ slot: 'clock', label: '작전일', path: 'day', suffix: '일차' }, { slot: 'gauge', label: '불만도', path: 'custom.불만도', suffix: '%' }, { slot: 'gauge', label: '오염', path: '__proto__.evil' }, { slot: 'gauge', label: '없음', path: 'ghost.value' }] }, state);
    expect(model.fixed).toEqual([{ id: 'hud:0', label: '작전일', value: '5일차' }]);
    expect(model.gauges).toEqual([{ id: 'hud:1', label: '불만도', value: '12%' }]);
  });
  it('선언 경로의 위험 키(constructor 등)는 칩이 되지 않고, 선언이 전부 무효면 표준 유도로 폴백한다', () => {
    const model = buildHudModel({ hud: [{ slot: 'gauge', label: '오염', path: 'constructor.name' }] }, { day: 1 });
    expect(model.gauges).toEqual([]); // 위험 경로는 읽지 않는다
    expect(model.fixed).toEqual([{ id: 'clock', label: '일차', value: '1' }]); // 깨진 선언 대신 표준 유도
  });
});
