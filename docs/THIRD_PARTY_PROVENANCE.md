# 제3자 코드 출처 (Third-Party Provenance)

이 프로젝트(GPL-3.0-or-later)에 선별 이식한 외부 코드의 출처를 기록한다. ADR 0001 · CLAUDE-TASK-HYPA §9 정책.

## RisuAI

- Repo: https://github.com/kwaroran/RisuAI
- License: GPL-3.0
- 비교 기준 commit: `9d8791ea842404ef3c7e6410c2359a2db7ca4bcd`
- 로컬 조사 클론: `C:\risu` (HEAD `eb7780b`, 위 기준 commit 이후 main)

### 이식/재현 내역

| 날짜 | 원본 파일·함수 | 우리 파일 | 이식 방식 | 변경 내용 |
|---|---|---|---|---|
| 2026-07-12 | `src/ts/process/memory/hypav3.ts` — `simpleCC` | `app/core/memory/ranking.js` — `weightedScoreCombination` | 의미 재현(전체 복사 아님) | 제네릭→id 문자열 키, Map 순회를 결정론 정렬로 안정화 |
| 2026-07-12 | `src/ts/process/memory/hypav3.ts` — `simpleRRF` | `app/core/memory/ranking.js` — `reciprocalRankFusion` | 의미 재현 | k 기본값 60 동일, tie-break에 id 사전순 추가(결정론) |
| 2026-07-12 | `src/ts/process/memory/hypav3.ts` — `childToParentRRF` | `app/core/memory/ranking.js` — `childToParentRRF` | 의미 재현 | 동일 알고리즘, 부모 키를 문자열로 |
| 2026-07-12 | `src/ts/process/memory/hypav3.ts` — `normalizeScores` | `app/core/memory/ranking.js` — `normalizeScores` | 의미 재현 | min==max 분기 동일 |
| 2026-07-12 | `hypav3.ts` 예산 선택(L500~820) — recent/similar/random 비율, 20% 기억 예산 | `app/core/memory/contextPlanner.js` — `planHypaV3` | 의미 재현 | 무작위 선택을 `Math.random` 대신 seed 기반으로 격리(결정론 재현 요구), frozen summary 사용 |

### 명시적으로 가져오지 않은 것

- `hypav3.ts` 전체, Risu DB(`DBState`)·Svelte store·localForage 결합
- LLM 요약 호출 파이프라인(1차 벤치마크는 frozen summary 사용)
- `Math.random()` 기반 기억 선택(기본 경로에서 배제, seed 모드로만 재현)
- Risu UI 트리(`HypaV3Modal` 등)

## Voyage AI

- 이번 세션(Phase A/B) 범위 아님 — 벤치마크 기반 완성 후 별도 진행.
- `voyage-context-3`(Risu 재현 기준) / `voyage-context-4`(최신 대안) REST 계약은 착수 시 이 문서에 기록.
