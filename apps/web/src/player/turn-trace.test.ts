import{describe,expect,it}from'vitest';import{summarizeWarningCodes}from'./turn-trace';

// 조립 경고는 나열이 아니라 집계다 — 용사여관은 unsupported_macro만 수천 개라,
// 나열하면 복사본이 도배되고 "몇 종류가 몇 번"이라는 답이 사라진다.
describe('summarizeWarningCodes',()=>{
  it('빈 경고는 "없음"',()=>{expect(summarizeWarningCodes([])).toBe('없음');});
  it('1회짜리는 횟수 없이, 반복은 ×횟수로 집계한다',()=>{
    const warnings=[{code:'unsupported_macro'},{code:'unsupported_macro'},{code:'unsupported_macro'},{code:'lore_budget'}];
    expect(summarizeWarningCodes(warnings)).toBe('unsupported_macro ×3, lore_budget');
  });
  it('첫 등장 순서를 유지한다',()=>{
    expect(summarizeWarningCodes([{code:'b'},{code:'a'},{code:'b'}])).toBe('b ×2, a');
  });
});
