import { describe, expect, it } from 'vitest';
import { parseCbs } from '../src/cbs.ts';
import { CbsBudget } from '../src/security/budget.ts';

// ADR 0004 M-S2a — 메인 스레드에서 이미 시작된 JS는 밖에서 끊을 수 없다. 시간 측정만으로는
// 단 한 번의 무거운 연산을 못 막으므로 구조적 상한(명령 수·항목 수·크기·깊이)이 실제 방어선이다.
// 검증은 시간이 아니라 "무엇에 걸렸는가"로 한다 — 1.9초 UI 정지도 통과시키는 시간 단언은 방어가 아니다.
const render = (source: string, budget = new CbsBudget()) => ({ out: parseCbs(source, { variables: {}, userName: '루키', budget }), limits: budget.breaches.map((breach) => breach.limit) });

describe('CBS 실행 예산 (M-S2a)', () => {
  it('range 폭발을 배열 생성 시점에 끊는다 — #each에 닿기 전이다', () => {
    expect(render('{{#each {{range::5000000}} as item}}{{slot::item}}{{/each}}').limits).toContain('array elements');
  });
  // step이 0이거나 음수면 i < end가 영원히 참이다. 생성량 계산(step||1)과 반복 조건(step)이 어긋나
  // 예산 검사를 통과한 뒤 무한 루프에 들어갔다 — 구조적 상한을 세워놓고 그 옆으로 빠져나가던 구멍.
  it.each([['step 0', '{{range::[0,10,0]}}'], ['음수 step', '{{range::[0,10,-1]}}'], ['Infinity end', '{{range::[0,1e400,1]}}']])('%s는 무한 루프가 아니라 예산 오류로 끝난다', (_name, source) => {
    const budget = new CbsBudget();
    const started = Date.now();
    parseCbs(source, { variables: {}, budget });
    expect(Date.now() - started).toBeLessThan(1000); // 멈추지 않는다는 최소 증거
    expect(budget.breaches.map((breach) => breach.limit)).toContain('array elements');
  });
  it('NaN 경계는 업스트림과 같이 빈 배열이다 — 루프가 애초에 돌지 않으므로 오류가 아니다', () => {
    const { limits, out } = render('{{range::[0,10,abc]}}');
    expect(limits).toEqual([]);
    expect(out).toBe('[]');
  });
  it('증폭 프리미티브는 공통 관문(parseArray·makeArray)에서 막힌다', () => {
    expect(render('{{makearray::' + Array.from({ length: 20 }, (_, i) => i).join('::') + '}}').limits).toEqual([]); // 정상 크기는 통과
    const huge = JSON.stringify(Array.from({ length: 20_000 }, (_, i) => i));
    expect(render(`{{split::${'a§'.repeat(20_000)}::§}}`).limits).toContain('array elements');
    expect(render(`{{arraypush::${huge}::x}}`).limits).toContain('array elements');
    expect(render(`{{spread::${huge}}}`).limits).toContain('array elements');
  });
  it('희소 배열 인덱스(arrayassert)는 직렬화 전에 막는다 — 원소 하나로 수십억 칸을 만든다', () => {
    expect(render('{{arrayassert::["a"]::999999999::b}}').limits).toContain('array index');
  });
  it('문자열 반복(cbr)은 만들기 전에 곱해서 막는다', () => {
    expect(render('{{cbr::99999999}}').limits).toContain('output');
  });
  it('일반 출력도 최종 안전망에 걸린다', () => {
    const budget = new CbsBudget({ input: 1_000_000, output: 500, ops: 20_000, eachItems: 5_000, depth: 32, softMs: 250 });
    expect(render('x'.repeat(2_000), budget).limits).toContain('output');
  });
  it('명령 수 상한이 주 기준이다', () => {
    const budget = new CbsBudget({ input: 1_000_000, output: 2_000_000, ops: 100, eachItems: 5_000, depth: 32, softMs: 250 });
    expect(render('{{user}}'.repeat(500), budget).limits).toContain('ops');
  });
  it('입력 크기와 중첩 깊이에도 상한이 있다', () => {
    const big = new CbsBudget({ input: 100, output: 2_000_000, ops: 20_000, eachItems: 5_000, depth: 32, softMs: 250 });
    expect(render('{{user}}'.padEnd(200, 'x'), big).limits).toContain('input');
    const deep = new CbsBudget({ input: 1_000_000, output: 2_000_000, ops: 20_000, eachItems: 5_000, depth: 3, softMs: 250 });
    parseCbs('{{#if {{#if {{#if {{#if {{user}}{{/if}}{{/if}}{{/if}}{{/if}}', { variables: {}, budget: deep });
    expect(deep.breaches.length).toBeGreaterThan(0);
  });
  it('경고는 호출 단위로 격리된다 — 이전 렌더의 오류가 다음 렌더에 따라붙지 않는다', () => {
    expect(render('{{arrayassert::["a"]::999999999::b}}').limits).toContain('array index');
    const clean = render('{{user}}의 골드'); // 바로 다음 정상 렌더
    expect(clean.limits).toEqual([]);
    expect(clean.out).toBe('루키의 골드');
  });
  it('정상 카드는 예산에 걸리지 않는다 — 방어가 기능을 죽이면 안 된다', () => {
    const budget = new CbsBudget();
    const out = parseCbs('{{#each {{range::20}} as i}}{{slot::i}} {{/each}}{{user}}의 골드: {{getvar::gold}}', { variables: { gold: '500' }, userName: '루키', budget });
    expect(out).toContain('루키의 골드: 500');
    expect(out).toContain('19');
    expect(budget.breaches).toEqual([]);
    expect(budget.softExceeded).toBe(false);
  });
});
