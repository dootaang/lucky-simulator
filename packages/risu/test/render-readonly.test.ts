import { describe, expect, it } from 'vitest';
import { parseCbs } from '../src/cbs.ts';
import { applyRegexScripts } from '../src/card-regex.ts';

// ADR 0004 M-S0 — 렌더는 영수증이지 거래가 아니다.
// 표시 경로(채팅 본문·배경 HTML·화자 추출·번역문)를 몇 번을 다시 그려도 세션 변수는 절대 변하지 않는다.
// 이 계약이 깨지면 스크롤·창 크기 변경·번역 표시만으로 카드 골드가 늘어난다(실제로 그랬다).
describe('표시 경로 읽기 전용 (M-S0)', () => {
  it('같은 본문을 여러 번 렌더해도 setvar/addvar가 세션 변수를 바꾸지 않는다', () => {
    const session: Record<string, string> = { count: '0', gold: '500' };
    const source = '{{setvar::count::{{? {{getvar::count}} + 1}}}}{{addvar::gold::100}}본문';
    for (let i = 0; i < 5; i += 1) parseCbs(source, { variables: session });
    expect(session).toEqual({ count: '0', gold: '500' });
  });
  it('표시 중 setvar는 아예 실행되지 않는다 — 업스트림도 동일(runVar 미전달)하므로 카드 호환성 손실이 없다', () => {
    const session: Record<string, string> = {};
    const out = parseCbs('{{setvar::badge::apron}}[{{getvar::badge}}]', { variables: session });
    expect(out).toBe('[]'); // 리스의 processScriptFull도 표시 경로에 runVar를 넘기지 않는다
    expect(session).toEqual({}); // 세션은 불변 — 스크래치 복사본이 이중 방어
  });
  it('배경 HTML·화면 너비 경로도 같은 계약을 따른다', () => {
    const session: Record<string, string> = { theme: 'day' };
    for (let i = 0; i < 3; i += 1) parseCbs('{{setvar::theme::night}}{{#when::{{? {{screen_width}} > 768}}}}wide{{/when}}', { variables: session, screenWidth: 1200 });
    expect(session.theme).toBe('day');
  });
  it('정규식 out이 만든 CBS도 표시 경로에서는 세션을 바꾸지 못한다 (regex → CBS 재파싱 경로)', () => {
    const session: Record<string, string> = { hits: '0' };
    const cbs = (text: string) => parseCbs(text, { variables: session });
    applyRegexScripts('실비아가 웃었다', [{ in: '웃었다', out: '{{setvar::hits::99}}웃었다', type: 'editdisplay', flag: 'g' }], 'display', { parser: cbs });
    expect(session.hits).toBe('0');
  });
  it('mutable:true(트리거 트랜잭션)에서만 실제로 쓴다 — 세션이 명시적으로 허용할 때', () => {
    const session: Record<string, string> = { count: '0' };
    parseCbs('{{setvar::count::7}}', { variables: session, mutable: true });
    expect(session.count).toBe('7');
  });
});
