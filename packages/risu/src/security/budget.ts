// CBS 실행 예산 (ADR 0004 M-S2a) — 메인 스레드 표시 경로의 구조적 상한.
//
// 왜 시간만으로 부족한가: 메인 스레드에서 이미 시작된 JS는 밖에서 끊을 수 없다. Date.now() 체크는
// 연산 사이에서만 듣고, 단 한 번의 무거운 연산({{#each {{range::1e7}}}})은 중간에 못 끊는다.
// 그래서 시간은 보조 계측이고, 주 기준은 명령 수·항목 수·크기다. 초과하면 예외로 파싱을 접고
// 안전한 원문으로 되돌린다 — 카드가 UI를 멈출 수 없다.
export class CbsBudgetExceeded extends Error { constructor(public readonly reason: string) { super(`cbs_budget_exceeded: ${reason}`); } }

export interface CbsBudgetLimits { input: number; output: number; ops: number; eachItems: number; depth: number; softMs: number }
// 실측(판타지시뮬봇 5종)으로 보정한 값. 정상 카드가 걸리면 상한을 올리기 전에 무엇이 비싼지 먼저 확인한다.
//   벨라돈나 첫 메시지 163,901자가 정규식 치환(out 39,868자)을 거치며 343,553자로 부푼다 → input은
//   정규식 확장 *후* 크기 기준이어야 한다. card-regex의 MAX_TEXT(1,000,000)와 같은 축척으로 맞춘다.
//   실측 9종(DOMINIUM·Tesselia·오렌티아·Isekai RE·벨라돈나·MORTAL·루미나·Merry Sisters·Rote):
//   하드·소프트 초과 0건, 최대 명령 수 2,222(Merry Sisters), 최대 35ms → ops 20,000은 9배 여유.
//   저사양 모바일 실측은 M-S1/S2 배선 후 다시 잰다.
export const DEFAULT_CBS_LIMITS: CbsBudgetLimits = { input: 1_000_000, output: 2_000_000, ops: 20_000, eachItems: 5_000, depth: 32, softMs: 250 };

export class CbsBudget {
  #ops = 0; #items = 0; #started = Date.now(); #soft = false;
  constructor(readonly limits: CbsBudgetLimits = DEFAULT_CBS_LIMITS) {}
  get softExceeded() { return this.#soft; }
  get ops() { return this.#ops; }
  input(length: number) { if (length > this.limits.input) throw new CbsBudgetExceeded(`input ${length} > ${this.limits.input}`); }
  output(length: number) { if (length > this.limits.output) throw new CbsBudgetExceeded(`output ${length} > ${this.limits.output}`); }
  depth(level: number) { if (level > this.limits.depth) throw new CbsBudgetExceeded(`depth ${level} > ${this.limits.depth}`); }
  // 모든 CBS 함수 호출이 여기를 지난다 — 명령 수가 주 기준이고, 시간은 여기서만 관측된다(중단 아님).
  op() { this.#ops += 1; if (this.#ops > this.limits.ops) throw new CbsBudgetExceeded(`ops ${this.#ops} > ${this.limits.ops}`); if (!this.#soft && Date.now() - this.#started > this.limits.softMs) this.#soft = true; }
  // 배열 생성 프리미티브(range 등)는 #each에 닿기도 전에 단 한 번의 연산으로 폭발한다.
  // 명령 수 예산은 이걸 못 막는다 — 호출은 1회이기 때문이다. 그래서 원소 수를 따로 센다.
  array(count: number) { this.#items += count; if (this.#items > this.limits.eachItems) throw new CbsBudgetExceeded(`array elements ${this.#items} > ${this.limits.eachItems}`); }
  // #each는 항목 수 × 본문 길이만큼 폭발한다. 누적으로 세야 블록을 잘게 쪼개는 우회를 막는다.
  each(items: number, bodyLength: number) { this.#items += items; if (this.#items > this.limits.eachItems) throw new CbsBudgetExceeded(`each items ${this.#items} > ${this.limits.eachItems}`); this.output(items * bodyLength); }
}

let active: CbsBudget | null = null;
export function withCbsBudget<T>(budget: CbsBudget, run: () => T): T { const previous = active; active = budget; try { return run(); } finally { active = previous; } }
export function cbsBudget(): CbsBudget | null { return active; }
