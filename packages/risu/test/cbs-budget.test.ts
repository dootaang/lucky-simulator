import { describe, expect, it } from 'vitest';
import { parseCbs, lastCbsBudgetBreach } from '../src/cbs.ts';
import { CbsBudget } from '../src/security/budget.ts';

// ADR 0004 M-S2a — 메인 스레드에서 이미 시작된 JS는 밖에서 끊을 수 없다. 시간 측정만으로는
// 단 한 번의 무거운 연산을 못 막으므로 구조적 상한(명령 수·항목 수·크기·깊이)이 실제 방어선이다.
// 초과하면 파싱을 접고 안전한 원문으로 되돌린다 — 카드는 UI를 멈출 수 없다.
describe('CBS 실행 예산 (M-S2a)', () => {
  it('#each 폭발을 항목 수 상한으로 끊는다 — 예산 없이는 메인 스레드가 멈춘다', () => {
    const started = Date.now();
    const out = parseCbs('{{#each {{range::5000000}} as item}}{{slot::item}}{{/each}}', { variables: {} });
    expect(Date.now() - started).toBeLessThan(2000); // 즉시 포기한다
    expect(out).toContain('#each'); // 안전한 원문으로 되돌아온다
    expect(lastCbsBudgetBreach()).toMatch(/array elements/); // range가 #each에 닿기 전에 끊긴다
  });
  it('명령 수 상한이 주 기준이다 — 무해한 매크로를 대량 반복해도 상한에서 멈춘다', () => {
    const budget = new CbsBudget({ input: 200_000, output: 400_000, ops: 100, eachItems: 5_000, depth: 32, softMs: 250 });
    const out = parseCbs('{{user}}'.repeat(500), { variables: {}, userName: '루키', budget });
    expect(budget.ops).toBeLessThanOrEqual(101);
    expect(out).toContain('{{user}}'); // 원문 반환
    expect(lastCbsBudgetBreach()).toMatch(/ops/);
  });
  it('입력 크기와 중첩 깊이에도 상한이 있다', () => {
    const big = new CbsBudget({ input: 100, output: 400_000, ops: 20_000, eachItems: 5_000, depth: 32, softMs: 250 });
    expect(parseCbs('{{user}}'.padEnd(200, 'x'), { variables: {}, budget: big })).toContain('{{user}}');
    expect(lastCbsBudgetBreach()).toMatch(/input/);
    const deep = new CbsBudget({ input: 200_000, output: 400_000, ops: 20_000, eachItems: 5_000, depth: 3, softMs: 250 });
    parseCbs('{{#if {{#if {{#if {{#if {{user}}{{/if}}{{/if}}{{/if}}{{/if}}', { variables: {}, budget: deep });
    expect(lastCbsBudgetBreach()).toMatch(/depth|ops/);
  });
  it('정상 카드는 예산에 걸리지 않는다 — 방어가 기능을 죽이면 안 된다', () => {
    const budget = new CbsBudget();
    const out = parseCbs('{{#each {{range::20}} as i}}{{slot::i}} {{/each}}{{user}}의 골드: {{getvar::gold}}', { variables: { gold: '500' }, userName: '루키', budget });
    expect(out).toContain('루키의 골드: 500');
    expect(out).toContain('19');
    expect(budget.softExceeded).toBe(false);
  });
});
