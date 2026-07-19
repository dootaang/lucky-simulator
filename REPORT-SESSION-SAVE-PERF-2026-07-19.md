# REPORT — 엔진 클릭 지연 수술 (진행 기록)

지시서: WORKORDER-SESSION-SAVE-PERF-2026-07-19.md / 설계: SPEC-SESSION-SAVE-PERF-2026-07-19.md
하니스: `corepack pnpm --filter @simbot/session perf:clicks`
(합성 회차 — 유닛 60기 상당 벌크 상태, 임포트 프리셋 raw ~80KB 모사, IDB는 구조적 클론+직렬화 근사)

## 하니스 수치 누적표

| 시점 | 50이벤트 p50/p95 (ms) | 1,000이벤트 p50/p95 (ms) | 1,000이벤트 payload | p95 성장배율 |
|---|---|---|---|---|
| **기준선 (파동 0)** | 78.6 / 108.1 | 635.3 / 712.3 | 30.7MB | 6.59× |

목표: 1,000이벤트 p95 ≤ 50ms, 성장배율 ≈ 1×(역사 비비례).

## 파동 진행 기록

### 파동 0 — 하니스 (완료)
- packages/session/scripts/click-perf-harness.mts + `perf:clicks` 스크립트.
- 기준선이 진단과 일치: 클릭당 비용·payload가 역사에 비례(6.6×/5.1×).
