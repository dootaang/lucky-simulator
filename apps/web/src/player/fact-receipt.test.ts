import { describe, expect, it } from 'vitest';
import { toFactLine } from './FactReceipt.svelte';

describe('사실 영수증 — 엔진 로그를 사람이 읽는 확정 사실로', () => {
  it('gold_delta를 골드 델타·잔액으로 읽는다', () => {
    const l = toFactLine({ ok: true, event: 'gold_delta', amount: 35000, before: 1000000, after: 1035000, reason: '점심 매출' }, 0);
    expect(l).toMatchObject({ icon: '🪙', label: '골드', delta: '+35,000', after: '1,035,000', note: '점심 매출', rejected: false });
  });

  it('자원 감소는 하락 표시(음수 델타)로 읽는다', () => {
    const l = toFactLine({ ok: true, event: 'resource_delta', resource: 'food', amount: -5, before: 200, after: 195 }, 1);
    expect(l).toMatchObject({ icon: '🍚', label: '식자재', delta: '-5', after: '195' });
  });

  it('scale_delta의 등급 변화를 note로 보여준다', () => {
    const l = toFactLine({ ok: true, event: 'scale_delta', scale: 'affinity', target: 'silvia', delta: 6, after: 26, tierChanged: { from: { label: '지인' }, to: { label: '친구' } } }, 2);
    expect(l).toMatchObject({ label: 'silvia affinity', delta: '+6', after: '26', note: '지인 → 친구' });
  });

  it('LLM이 차단된 이벤트를 시도하면 거부 사실로 읽는다(치트 채널 차단 가시화)', () => {
    const l = toFactLine({ ok: false, event: 'gold_delta', reason: 'model_event_not_allowed' }, 3);
    expect(l.rejected).toBe(true);
    expect(l.note).toContain('엔진이 차단');
  });

  it('알 수 없는 성공 이벤트도 안전하게 요약한다', () => {
    const l = toFactLine({ ok: true, event: 'mystery_event', amount: 3, after: 9 }, 4);
    expect(l).toMatchObject({ icon: '⚙️', label: 'mystery_event', delta: '+3', after: '9', rejected: false });
  });
});

describe('티어 통과 칩', () => {
  it('승급은 ✨(star), 강등은 ⚠(alert)로 구분한다', () => {
    const up = toFactLine({ ok: true, event: 'scale_delta', target: 'silvia', scale: 'affinity', delta: 4, after: 152, tierChanged: { from: { label: '신뢰', range: [81, 150] }, to: { label: '애착', range: [151, 180] } } }, 0);
    expect(up.icon).toBe('✨'); expect(up.note).toBe('신뢰 → 애착');
    const down = toFactLine({ ok: true, event: 'scale_delta', target: 'clem', scale: 'affinity', delta: -6, after: 78, tierChanged: { from: { label: '호의', range: [81, 110] }, to: { label: '중립', range: [51, 80] } } }, 1);
    expect(down.icon).toBe('⚠️'); expect(down.note).toBe('호의 → 중립');
  });
});

describe('전투 영수증', () => {
  it('전투 개시에서 적 이름과 나머지 수를 읽는다', () => {
    const line = toFactLine({ ok: true, event: 'start_encounter', enemies: [{ name: '고블린' }, { name: '고블린 궁수' }, { name: '오크' }] }, 0);
    expect(line).toMatchObject({ label: '전투 개시', delta: null, after: null, note: '고블린 외 2', rejected: false });
    expect(line.icon).not.toBe('⚙️');
  });

  it('공격·기술의 명중, 치명타, 빗나감과 적 전멸을 구분한다', () => {
    const attack = toFactLine({ ok: true, event: 'combat_action', action: 'attack', target: 'e1', hit: true, tier: 'success', damage: 7, enemy: { name: '고블린', hp: { cur: 5, max: 12 } }, cleared: false }, 0);
    expect(attack).toMatchObject({ label: '고블린 · 공격', delta: '-7', after: 'HP 5', note: '명중' });

    const skill = toFactLine({ ok: true, event: 'combat_action', action: 'skill', skill: '강타', target: 'e1', hit: true, tier: 'critical_success', damage: 12, enemy: { name: '고블린', hp: { cur: 0, max: 12 } }, cleared: true }, 1);
    expect(skill).toMatchObject({ label: '고블린 · 강타', delta: '-12', after: 'HP 0', note: '치명타 · 적 전멸' });

    const miss = toFactLine({ ok: true, event: 'combat_action', action: 'attack', target: 'e1', hit: false, tier: 'failure', damage: 0, enemy: { name: '고블린', hp: { cur: 12, max: 12 } }, cleared: false }, 2);
    expect(miss).toMatchObject({ delta: null, after: 'HP 12', note: '빗나감' });
  });

  it('방어와 도주 성공·실패를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'combat_action', action: 'defend', guard: true }, 0)).toMatchObject({ label: '방어 태세', note: '' });
    expect(toFactLine({ ok: true, event: 'combat_action', action: 'flee', fled: true }, 1)).toMatchObject({ label: '도주 성공', note: '' });
    expect(toFactLine({ ok: true, event: 'combat_action', action: 'flee', fled: false }, 2)).toMatchObject({ label: '도주 실패', note: '' });
  });

  it('적 턴의 명중 수·총 피해·플레이어 잔여 HP와 쓰러짐을 읽는다', () => {
    const line = toFactLine({ ok: true, event: 'enemy_turn', results: [{ enemyId: 'e1', intent: 'attack', hit: true, damage: 3 }, { enemyId: 'e2', intent: 'heavy', hit: false, damage: 0 }, { enemyId: 'e3', intent: 'attack', hit: true, damage: 4 }], playerHp: { cur: 0, max: 20 }, playerDead: true }, 0);
    expect(line).toMatchObject({ label: '적 반격 · 2회 명중 · 피해', delta: '-7', after: 'HP 0', note: '쓰러짐', icon: '⚠️' });
  });

  it.each([
    ['victory', '전투 승리'],
    ['fled', '전투 도주'],
    ['defeat', '전투 패배'],
    ['ended', '전투 종료'],
  ])('전투 종료 outcome %s를 한국어로 읽는다', (outcome, label) => {
    const line = toFactLine({ ok: true, event: 'end_encounter', outcome, expGained: 25, goldGained: 10, levelUps: [2], revivedHp: outcome === 'defeat' ? 3 : undefined }, 0);
    expect(line.label).toBe(label);
    expect(line.note).toContain('경험치 +25');
    expect(line.note).toContain('골드 +10');
    expect(line.note).toContain('레벨 업 → Lv.2');
    if (outcome === 'defeat') expect(line.note).toContain('HP 3로 부활');
  });
});

describe('아이템·상거래·의뢰 영수증', () => {
  it('아이템 사용의 회복 풀·증가·결과·잔여를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'use_item', itemId: '회복약', pool: 'hp', amount: 30, before: 50, after: 80, remaining: 2 }, 0)).toMatchObject({ label: '회복약 · hp', delta: '+30', after: '80', note: '남은 2' });
  });

  it('판매와 아이템 구매의 골드 증감·소모·보유를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'sale', menuName: '스튜', qty: 2, goldDelta: 10000, consumed: { food: 2 } }, 0)).toMatchObject({ label: '스튜 ×2', delta: '+10,000', note: '식자재 -2' });
    expect(toFactLine({ ok: true, event: 'buy_item', menuName: '회복 물약', qty: 1, goldDelta: -1000, owned: 3 }, 1)).toMatchObject({ label: '회복 물약 ×1', delta: '-1,000', note: '보유 3' });
  });

  it('단건·일괄 구매의 품목과 골드 감소를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'purchase', resource: 'herb', qty: 3, goldDelta: -300 }, 0)).toMatchObject({ label: 'herb ×3', delta: '-300', note: '' });
    expect(toFactLine({ ok: true, event: 'purchase_batch', items: [{ resource: 'food', qty: 2, cost: 6000 }, { resource: 'herb', qty: 3, cost: 300 }], goldDelta: -6300 }, 1)).toMatchObject({ label: '품목 2종 구매', delta: '-6,300', note: 'food ×2 · herb ×3' });
  });

  it('시설 업그레이드와 의뢰 성공·실패·조우를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'upgrade', facility: 'kitchen', level: 2, goldDelta: -1000 }, 0)).toMatchObject({ label: 'kitchen Lv.2', delta: '-1,000' });
    expect(toFactLine({ ok: true, event: 'attempt_quest', questId: 'q1', name: '약초 배달', roll: 18, tier: 'critical_success', success: true, goldDelta: 500 }, 1)).toMatchObject({ label: '약초 배달 · 성공', delta: '+500', note: '굴림 18 · 대성공' });
    expect(toFactLine({ ok: true, event: 'attempt_quest', questId: 'q1', name: '약초 배달', roll: 2, tier: 'failure', success: false }, 2)).toMatchObject({ label: '약초 배달 · 실패', delta: null, note: '굴림 2' });
    expect(toFactLine({ ok: true, event: 'attempt_quest', questId: 'q2', name: '토벌', encounter: 'goblin', enemies: [], text: '토벌 수행 중 고블린 조우!' }, 3)).toMatchObject({ label: '의뢰 조우', note: '토벌 수행 중 고블린 조우!' });
  });

  it('보상과 숙박 수락·거절을 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'reward', questId: 'q1', tier: 'E', goldDelta: 700, before: 1000, after: 1700, reason: '의뢰 보상' }, 0)).toMatchObject({ label: '의뢰 보상', delta: '+700', after: '1,700', note: '의뢰 보상' });
    expect(toFactLine({ ok: true, event: 'lodging_accept', requestId: 'lodging:1:1', roomNo: '101', goldDelta: 30000 }, 1)).toMatchObject({ label: '101호 숙박 수락', delta: '+30,000', note: 'lodging:1:1' });
    expect(toFactLine({ ok: true, event: 'lodging_reject', requestId: 'lodging:1:2' }, 2)).toMatchObject({ label: '숙박 거절', delta: null, note: 'lodging:1:2' });
  });

  it('여관 영업·사건·숙박 문의·우편의 실제 수치를 읽는다', () => {
    expect(toFactLine({ ok: true, event: 'traffic_wave', wave: 'lunch', potential: 5, customers: 4, served: 3, revenue: 15000, sales: [], stockout: 1 }, 0)).toMatchObject({ label: '영업 · 3명 응대', delta: '+15,000', note: 'lunch · 방문 4 · 미응대 1' });
    expect(toFactLine({ ok: true, event: 'traffic_wave', wave: 'dinner', skipped: true }, 1)).toMatchObject({ label: '영업 건너뜀', note: 'dinner' });
    expect(toFactLine({ ok: true, event: 'traffic_wave', wave: 'night', incidentId: 'noise', label: '소란', awaitingChoice: true }, 2)).toMatchObject({ label: '영업 사건 발생', note: '소란' });
    expect(toFactLine({ ok: true, event: 'incident_choice', incidentId: 'noise', choice: 'settle', goldDelta: -200, goldShortfall: 0, wave: { revenue: 5000 } }, 3)).toMatchObject({ label: '영업 사건 해결', delta: '-200', note: 'settle · 영업 매출 +5,000' });
    expect(toFactLine({ ok: true, event: 'lodging_review', requests: [{ party: 2, stayDays: 1 }, { party: 1, stayDays: 2 }] }, 4)).toMatchObject({ label: '숙박 문의 확인', after: '2건' });
    expect(toFactLine({ ok: true, event: 'mail_check', letters: [{ type: 'reward' }] }, 5)).toMatchObject({ label: '우편 확인', after: '1건' });
    expect(toFactLine({ ok: true, event: 'mail_open', mailId: 'm1', type: 'reward', axis: 'service', goldDelta: 900 }, 6)).toMatchObject({ label: '우편 보상', delta: '+900', note: 'service' });
  });
});

describe('전투·아이템 거부 사유', () => {
  it.each([
    ['combat_number_not_allowed', '전투 수치 직접 지정 불가'],
    ['insufficient_stock', '재고 부족'],
    ['out_of_stock', '재고 없음'],
    ['pool_full', '이미 최대치'],
    ['item_number_not_allowed', '아이템 수치 직접 지정 불가'],
    ['in_combat', '전투 중에는 이용 불가'],
    ['insufficient_mp', 'MP 부족'],
  ])('%s 코드를 짧은 한국어로 읽는다', (reason, note) => {
    expect(toFactLine({ ok: false, event: 'use_item', reason }, 0)).toMatchObject({ rejected: true, note });
  });
});
