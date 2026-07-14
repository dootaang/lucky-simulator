# `03074d8` 마이그레이션 패리티 전수 감사

- 감사일: 2026-07-14
- 기준: `5045fdd` (`main`, 감사 착수 시 `origin/main`과 동일)
- 대상 커밋: `03074d815ef5624464c5e67b469cb43e3ccd2f83` (`migration: remove legacy JavaScript application`)
- 우선 기준: ADR 0001 → ADR 0002(제품) → DESIGN → ROADMAP → BACKLOG

## 1. 결론

`03074d8`은 **170개 파일을 삭제한 커밋이 아니다.** 정확한 실측은 **170경로 변경 = 삭제 157 + 수정 11 + 추가 2**, 114줄 추가·64,610줄 삭제다. 아래 원장은 수정·추가 경로까지 포함한 170경로 전부를 분류한다.

현재 앱은 빈 껍데기가 아니다. 카드 파서, 결정론 엔진, 장르 모듈, 현재 상태·RNG·기억 저장, 무결성 해시, 대안 응답 저장, 기본 프롬프트/로어, 브라우저 저장소는 현행 TypeScript 계층과 테스트로 대체됐다. 그러나 사용자가 직접 체감하는 아래 계약은 유실 또는 축소됐다.

1. 시뮬레이션 버튼으로 실행한 현장·일괄·장부 행동이 채팅 서사로 이어지지 않는다.
2. 사건을 순서대로 보존·재생하는 원장과 새로고침 뒤에도 남는 undo/redo가 없다.
3. 세션 시작 시점의 페르소나·프리셋이 백업에 고정되지 않는다.
4. 화자·감정은 마지막 응답 하나만 들고 있어 메시지별 대안/리롤과 함께 복원할 수 없다.
5. Risu 로어의 확률·대소문자·재귀·source 합성과 기억의 `factRefs`·`continuityPatch` 연결이 축소됐다.
6. LLM 실행 기록은 옛 최근 500건에서 현재 최근 8건으로 줄었다.

따라서 판정은 **“현재 상태 snapshot은 대체됐지만, 재생 가능한 사건 원장과 장기 플레이의 일부 계약은 유실됐다”**다. 옛 앱 전체를 되살리면 Svelte UI·현행 무결성 구조와 중복되므로 금지한다.

## 2. 판정 방법

| 코드 | 판정 | 이 감사에서 사용한 기준 |
|---|---|---|
| C | 완전 대체 | 현행 구현과 회귀 테스트가 사용자 동작을 함께 증명 |
| P | 부분 대체 | 현행 기능은 있으나 옛 계약 일부 또는 동등성 테스트가 없음 |
| L | 필수 유실 | ADR/DESIGN상 필요한 사용자 동작이 현행에 없음 |
| I | 의도적 폐기 | 레거시 DOM UI, 빌드 산출물, 중복 패키지 껍데기 등 복구 금지 |

파일 하나에 여러 계약이 있으면 파일 판정은 `P`로 두고, 유실 계약을 §4에서 `L`로 분리했다. 이름이 비슷한 현행 파일의 존재만으로 `C`를 주지 않았다.

## 3. 기능 계약별 판정과 1차 근거

| 계약 | 판정 | 현행 근거와 차이 |
|---|---|---|
| 카드 JSON/PNG/CharX/RISUM/JPEG 파싱·원본 보존 | P | `packages/card/src/index.ts`, `document.test.ts`, `zip-index.test.ts`. JSON·CharX·PNG 편집 왕복과 지연 ZIP은 검증되지만 독립 RISUM/JPEG 오류·왕복의 옛 경계 테스트가 동등하게 남아 있지 않다. |
| SimPack v0.2·runtime project·화면 안전 실행 | C | `packages/simpack/test/{roundtrip,legacy-parity,manifest-validation}.test.ts`, `packages/runtime/test/runtime.test.ts`. |
| Risu 프롬프트·프리셋·페르소나 파일 | P | `packages/risu/test/{prompt-parity,preset-pipeline,preset-file}.test.ts`, `packages/card/test/persona-png.test.ts`. 기본 계약은 대체됐지만 세션 고정 snapshot은 별도 유실이다. |
| Risu CBS·regex·module | P | `packages/risu/test/render-pipeline.test.ts`, `apps/web/src/player/card-library.test.ts`. 안전 부분집합과 에셋 모듈 바인딩은 복구됐지만 옛 embedded resolver 계층과 trigger/toggle/background 동등성은 미증명이다. |
| Risu 로어 활성화 | P | `packages/risu/src/lore.ts`는 key/secondary/constant/selective/order/depth와 토큰 예산을 처리한다. 삭제 전 `risuRuntimeCompatibility.test.js`가 검증한 확률·case-sensitive·recursive activation·source 합성은 없다. |
| 기억 검색·abstention·Voyage·캐시 | P | `packages/memory/test/recovery.test.ts`와 300턴/120문항 fixture가 핵심 검색을 복구했다. 다만 옛 `continuityPatch`, `factRefs` 판정 trace, 실제 scene/viewer 공급은 세션에 미연결이다. |
| 프롬프트 컴파일 기본 계약 | C | `packages/risu/test/prompt-parity.test.ts`, `preset-pipeline.test.ts`. 카드 원문, `{{original}}`, depth/range, 엔진 블록 가산성을 검증한다. |
| 관리 행동 자동 서사화 | L | 삭제 전 `app/src/playView.js`의 `runManagementTurn`·`runManagementBatch`·`runLedgerAction`과 `app/src/llm/prompt.js`의 `buildNarrationPrompt`에만 존재. 현행 `ScreenRenderer.svelte`/`InnManagement.svelte`는 `runtime.dispatch()` 후 채팅 생성 경로를 호출하지 않는다. |
| 결정론 엔진·장르 모듈 | C | `packages/kernel/test/{registry,rng-parity,state-parity}.test.ts`, `packages/modules/test/{inn,combat,hunter,cross-genre,security-guards}.test.ts`. |
| 사건 원장·임의 시점 재생·영속 undo/redo | P/L | `SessionSnapshot`은 현재 상태·RNG·기억·대안을 저장하지만 사건열, `stateAt`, `truncateTo`, 체크포인트/redo 저장이 없다. `packages/contracts/src/session.ts`의 `SessionBundle`은 사용처가 0인 유령 계약이다. |
| 세션 백업 무결성 | P | `packages/session/test/integrity.test.ts`, 300턴 `session.test.ts`는 현재 snapshot 복원을 증명한다. 사건 재생 손상 검사, import 크기/사건 상한, persona/preset snapshot은 없다. |
| PromptRun | P | `packages/session/src/index.ts`는 상세 실행 자료를 보존하지만 `if(this.#promptRuns.length>8)`로 최근 8건만 유지한다. 옛 `engineSession.js`는 500건이었다. |
| 메시지별 화자·감정 | L | 현행 snapshot은 세션 전체 `lastSpeakers` 하나만 저장한다. 삭제 전 메시지의 `npcIds`와 `renderNpcAvatars(message.npcIds)` 계약이 없다. |
| 컴파일러·Lua 정적 채굴 | C | `packages/compiler/test/{llm-compiler,schema-normalize,schema-patch}.test.ts`. Lua를 실행하지 않고 채굴·검증·교정을 수행한다. 단, 장르 114개 중 입력 예시가 있는 33개라는 별도 커버리지 문제는 이 커밋 패리티와 분리한다. |
| 브라우저 OPFS/SQLite·저장소 | C | `packages/persistence/src/browser.ts`와 현행 세션/카드 저장 테스트. 옛 단일 JS 앱의 Worker 파일은 새 Vite 빌드에서 대체됐다. |
| 레거시 DOM 화면·CSS·빌드 산출물 | I | Svelte 앱과 pnpm 워크스페이스로 의도적으로 교체. 기능 계약이 유실된 `playView.js` 일부만 위 항목으로 분리한다. |
| 마이그레이션 기준 스크립트 | P | `scripts/migration/baseline.mjs`가 옛 앱/엔진과 새 패키지를 나란히 검사하던 경로에서 현행 `pnpm check`만 검사하는 경로로 축소됐다. 현재 검증에는 유용하지만 옛-새 동등성 증명은 아니다. |

## 4. 확정된 필수 유실과 부분 대체

### 필수 유실

1. **관리 행동 → 채팅 자동 서사화**: 엔진 계산은 되지만 플레이 기록과 이야기로 이어지지 않는다. API 실패 시에도 “엔진 결과 유지” 메시지를 남기던 폴백까지 유실됐다.
2. **메시지별 화자·감정**: 과거 응답·대안·리롤을 고를 때 그 응답의 캐릭터 이미지가 함께 바뀌지 않는다.
3. **append-only 사건 원장**: 성공·실패 사건, 사건별 상태 해시, 중간 snapshot, `stateAt()`/`truncateTo()`, 재생 손상 검사가 없다.
4. **영속 undo/redo**: 같은 탭의 최대 30개 checkpoint는 동작하지만 저장·재개하면 이력이 사라진다.
5. **세션 시작 시점 페르소나·프리셋 snapshot**: 라이브러리와 카드별 선택은 있지만 세션 백업이 당시 설정을 소유하지 않는다.
6. **Risu 고급 로어 활성화**: 확률, case-sensitive, recursion, 폴더/source 합성이 없다. 순수 로어북 카나리아인 Tesselia보다 먼저 복구해야 한다.
7. **기억 연속성 제안·검증 연결**: `continuityPatch`, `factRefs`, 사건 근거별 폐기와 판정 trace의 프로덕션 연결이 없다.

### 부분 대체·감사 부채

- PromptRun은 상세하지만 8개만 남는다.
- 세션 JSON import는 전체 `file.text()`/`JSON.parse()` 전에 크기 상한을 검사하지 않는다.
- `SessionBundle`은 계약만 있고 생산·소비·테스트가 없다. WP1에서 현행 `SessionSnapshot`과 통합하거나 폐기해야 한다.
- 카드 파서의 RISUM/JPEG와 Risu module의 trigger/toggle/background는 현행 코드가 있어도 옛 경계 계약과 동등한 회귀 테스트가 부족하다.
- 마이그레이션 baseline은 현행 건강성 검사이지 레거시 패리티 검사로 쓰면 안 된다.

## 5. 문서 정정

- BACKLOG의 사건 원장, `stateAt`/`truncateTo`, 단일 세션 백업, “모든 LLM 요청”, 300사건 재생, 세션별 페르소나 snapshot, 고급 로어, 기억 출력 계약의 거짓 완료를 미완료/부분 대체로 정정했다.
- 현행 300턴 테스트가 검증하는 것은 **현재 상태·RNG·기억 복원과 프롬프트 상한**이며, 삭제된 테스트가 검증하던 것은 **300사건 append-only 재생·중간 복원·분기·손상 탐지**라고 구분했다.
- ROADMAP의 Phase 0·용사여관·이사 환경 “완료”를 부분 완료/회귀 복구 필요로 정정했다.
- 중복된 ADR 번호를 정리해 제품 ADR은 0002로 유지하고 TypeScript·Svelte 마이그레이션 ADR을 `0003-typescript-svelte-migration.md`로 옮겼다.
- `packages/session/src/index.ts`의 “체크포인트와 대안은 런타임 전용” 주석을 “체크포인트·redo만 런타임 전용, 대안은 snapshot 저장”으로 정정했다.

## 6. 후속 작업 순서 조정안

WP0 결과 때문에 원 작업지시서의 범위를 다음처럼 조정한다.

1. **WP1 확대**: 사건 원장·영속 undo/redo에 세션 고정 persona/preset, import 상한, PromptRun 보존 정책, `SessionBundle` 통합/폐기 결정을 포함한다.
2. **WP2 유지**: 원장 위에 관리 행동 자동 서사화와 실패 폴백을 복구한다.
3. **WP3 유지**: 메시지별 화자·감정과 대안/리롤 동기화를 복구한다.
4. **WP3A 완료 (`2026-07-14`) — 기억 연속성 패리티**: `factRefs`, `continuityPatch` 사용자 검토, scene/viewer 공급, 사건 근거 폐기를 현행 세션·저장·검사기에 연결했다.
5. **WP3B 완료 (`2026-07-14`) — Risu 로어 패리티**: 확률·case-sensitive·recursion·폴더 제외·카드/모듈 source 우선순위를 실제 프롬프트 조립 경로에 복구했다.
6. **WP4~WP6 유지**: 반응형 패널/페르소나 아바타 → 응답 도구막대/메시지별 대안 → 에셋 모듈 메뉴 이전 순서. WP3A/3B의 실제 의존성에 따라 세부 순서는 조정할 수 있다.

WP1 이후 기능 복구는 사용자 확인 전 착수하지 않는다.

## 7. 170경로 전수 판정 원장

아래 그룹 수 합계는 `10 + 13 + 7 + 10 + 5 + 3 + 14 + 4 + 4 + 25 + 30 + 21 + 21 + 3 = 170`이다. `M/A`도 대상 커밋이 바꾼 경로이므로 빠뜨리지 않았다.

### G01 — 레거시 패키지·빌드·산출물 10경로: I

```text
I D app/build.mjs
I D app/dist/index.html
I D app/dist/sqlite-worker.js
I D app/dist/sqlite3-opfs-async-proxy.js
I D app/dist/sqlite3.wasm
I D app/package-lock.json
I D app/package.json
I D app/serve.mjs
I D app/tsconfig.json
I D engine/package.json
```

### G02 — 전환 커밋의 현행 연결부 13경로: C/P

```text
C M README.md
P M apps/web/src/player/ChatPanel.svelte
P M apps/web/src/player/PlayerPage.svelte
P M apps/web/src/player/ScreenRenderer.svelte
C M docs/DESIGN.md
C M docs/THIRD_PARTY_PROVENANCE.md
C M packages/compiler/src/index.ts
C M packages/compiler/test/compiler.test.ts
P M packages/risu/src/index.ts
P A packages/risu/src/lore.ts
P A packages/risu/test/lore.test.ts
P M packages/session/src/index.ts
P M scripts/migration/baseline.mjs
```

### G03 — 카드 컨테이너 7경로: P

```text
P D app/core/card/assets.js
P D app/core/card/cardAssets.js
P D app/core/card/charx.js
P D app/core/card/json.js
P D app/core/card/parseCard.js
P D app/core/card/png.js
P D app/core/card/risum.js
```

### G04 — Risu 호환 경계 10경로: P

```text
P D app/core/compat/browserLibrary.ts
P D app/core/compat/contracts.ts
P D app/core/compat/moduleResolver.js
C D app/core/compat/personaPng.ts
C D app/core/compat/regexPipeline.js
P D app/core/compat/risuCompatibility.js
P D app/core/compat/risuPreset.ts
P D app/core/compat/roundTrip.ts
C D app/core/compat/safeCbs.js
C D app/core/compat/schemas.js
```

### G05 — 편집·화면 runtime·SimPack 5경로: C

```text
C D app/core/editor/projectEditor.js
C D app/core/screens/runtime.js
C D app/core/simpack/contracts.ts
C D app/core/simpack/runtimeProject.js
C D app/core/simpack/simpack.js
```

### G06 — 로어 3경로: P

```text
P D app/core/lorebook/activate.js
P D app/core/lorebook/normalize.js
C D app/core/lorebook/tokens.js
```

### G07 — 기억 14경로: C/P

```text
C D app/core/memory/abstention.ts
C D app/core/memory/benchmark.js
P D app/core/memory/contextPlanner.js
P D app/core/memory/continuityStore.ts
P D app/core/memory/contracts.ts
C D app/core/memory/embeddingCache.ts
C D app/core/memory/groundedLexical.ts
C D app/core/memory/groundedPlanner.ts
C D app/core/memory/narrativeVerifier.ts
C D app/core/memory/providers/fixed.js
C D app/core/memory/providers/voyage.ts
C D app/core/memory/ranking.js
C D app/core/memory/retrievers/lexical.js
C D app/core/memory/retrievers/semantic.js
```

### G08 — 프롬프트 컴파일 코어 4경로: C

```text
C D app/core/prompt/comparePrompt.js
C D app/core/prompt/compilePrompt.js
C D app/core/prompt/contracts.ts
C D app/core/prompt/presetFactory.js
```

### G09 — 세션 4경로: P/L

```text
C D app/core/session/browserPersistence.ts
P D app/core/session/contracts.ts
P D app/core/session/memoryStore.js
P D app/core/session/playSession.js
```

### G10 — 레거시 앱 화면·조정자 25경로: C/P/I

```text
I D app/src/activateView.js
I D app/src/assetsView.js
I D app/src/declarativeScreenView.js
I D app/src/editorView.js
P D app/src/engineSession.js
I D app/src/engineView.js
I D app/src/importView.js
C D app/src/llm/byokSettings.js
C D app/src/llm/cardDiagnosis.js
C D app/src/llm/compilerPrompt.js
C D app/src/llm/luaMine.js
P D app/src/llm/prompt.js
C D app/src/llm/providers.js
C D app/src/llm/schemaPatch.js
C D app/src/llm/vertexAuth.js
I D app/src/lorebookView.js
I D app/src/main.js
P D app/src/npcGallery.js
C D app/src/persistence/sqliteWorker.ts
P D app/src/playView.js
C D app/src/schema/validate.js
P D app/src/speakerResolver.js
I D app/src/style.css
I D app/src/theme/cardTheme.js
I D app/src/ui/dom.js
```

### G11 — 레거시 앱 테스트·fixture 30경로: C/P/L

```text
C D app/test/alternateHuntersProject.test.js
C D app/test/boundary.test.js
C D app/test/browserPersistence.test.ts
C D app/test/cardDiagnosis.test.js
P D app/test/compilerCoverage.test.js
P D app/test/continuityStore.test.ts
C D app/test/fixtures/memory-benchmark/corpus.json
C D app/test/fixtures/memory-benchmark/questions.json
C D app/test/fixtures/prompt-parity/01-card-only.json
C D app/test/fixtures/prompt-parity/02-original-merge.json
C D app/test/fixtures/prompt-parity/03-persona-lore-depth-range.json
C D app/test/fixtures/prompt-parity/04-simpack-additive.json
C D app/test/fixtures/prompt-parity/05-unsupported-macro.json
C D app/test/luaMine.test.js
C D app/test/memoryBenchmark.test.js
P D app/test/memoryPhaseC.test.ts
C D app/test/narrativeVerifier.test.ts
P D app/test/playSession.test.js
C D app/test/projectEditor.test.js
P D app/test/prompt.test.js
C D app/test/promptCompiler.test.js
P D app/test/risuArtifacts.test.ts
P D app/test/risuCompatibility.test.js
P D app/test/risuRuntimeCompatibility.test.js
C D app/test/screenRuntime.test.js
L D app/test/sessionStore.test.js
C D app/test/simpack.test.js
P D app/test/speakerResolver.test.js
C D app/test/validate-combat.test.js
C D app/test/validate-traffic.test.js
```

### G12 — 결정론 엔진 21경로: C, 사건 원장만 L

```text
C D engine/core/applyEvent.js
C D engine/core/combat.js
C D engine/core/createState.js
C D engine/core/dayEnd.js
C D engine/core/moduleRegistry.js
C D engine/core/modules/combat.js
C D engine/core/modules/commonRpg.js
C D engine/core/modules/eventSupport.js
C D engine/core/modules/hunter.js
C D engine/core/modules/inventory.js
C D engine/core/modules/legacy.js
C D engine/core/modules/stats.js
C D engine/core/pools.js
C D engine/core/questEncounter.js
C D engine/core/quests.js
C D engine/core/resolveCheck.js
C D engine/core/rng.js
C D engine/core/selectors.js
L D engine/core/sessionJournal.js
C D engine/core/traffic.js
C D engine/core/utils.js
```

### G13 — 결정론 엔진 테스트·fixture 21경로: C, 사건 원장만 L

```text
C D engine/test/combat-guards.test.js
C D engine/test/combat.test.js
C D engine/test/commonRpgModules.test.js
C D engine/test/crossGenre.test.js
C D engine/test/extractedModules.test.js
C D engine/test/fixtures/generic-combat.workflow.json
C D engine/test/fixtures/hero-inn.workflow.json
C D engine/test/golden.test.js
C D engine/test/helpers.js
C D engine/test/hunterModule.test.js
C D engine/test/items.test.js
C D engine/test/moduleRegistry.test.js
C D engine/test/prototypePollution.test.js
C D engine/test/questEncounter.test.js
C D engine/test/quests.test.js
L D engine/test/sessionJournal.test.js
C D engine/test/settlement.test.js
C D engine/test/spec-f3.test.js
C D engine/test/traffic.test.js
C D engine/test/unit.test.js
C D engine/test/workflowGolden.test.js
```

### G14 — 기억 벤치 도구 3경로: C

```text
C D scripts/generate-memory-corpus.mjs
C D scripts/memory-benchmark-live.mts
C D scripts/memory-benchmark.mjs
```

## 8. 검증 기준

`pnpm verify` 통과(2026-07-14): TypeScript/Svelte 진단 0건, **단위 테스트 282개**, 프로덕션 빌드, **Playwright 브라우저 테스트 10개**가 모두 통과했다. 이 검증은 현행 코드가 깨지지 않았음을 뜻하며, 이 문서에서 `P/L`로 판정한 삭제 전 계약이 존재한다는 뜻은 아니다.
