# 전투 콘솔 구현 보고서 (2026-07-15)

## 사용자에게 달라지는 것

의뢰를 수행하다 전투가 시작되면 이제 시뮬레이션 화면이 자동으로 다시 열리고, 화면 맨 위에 전투 콘솔이 나타납니다. 사용자는 적의 이름·랭크·HP·다음 공격 예고와 플레이어의 HP/MP/SP 같은 수치를 확인한 뒤 공격, 스킬, 방어, 도주, 소모품 사용을 선택할 수 있습니다.

공격이나 소모품 사용 같은 한 턴은 엔진이 먼저 결과를 확정하고 적의 반격까지 한 묶음으로 처리한 다음, 모델이 그 결과를 한 번만 이야기로 풀어냅니다. 적을 모두 쓰러뜨리거나 도주하거나 패배하면 결과에 맞는 전투 종료 버튼이 나타나며, 종료 후 전투 콘솔은 사라지고 결과 서사가 채팅에 남습니다. 따라서 의뢰가 조우를 만들었는데 다음 행동 화면이 없어 멈추던 문제가 해소됐습니다.

## 변경 파일과 이유

- `packages/modules/src/combat.ts`: `combat/console` selector를 추가했습니다. 전투 표시 여부, 적과 플레이어의 정규화된 수치, 적 의도, 스킬 사용 가능 여부와 한국어 불가 사유, 도주율, 종료 가능 여부와 결과를 모두 여기서 계산합니다.
- `packages/modules/test/combat.test.ts`: 전투 없음 기본형, 풀 정규화, 강공 의도, 스킬 비용 부족, 승리·도주·패배 종료 계약을 검증하는 단위 테스트를 추가했습니다.
- `apps/web/src/player/CombatConsole.svelte`: selector 결과만 표시하고 ID 계열 값만 보내는 범용 전투 위젯을 추가했습니다. 공격·스킬·방어·도주·소모품은 플레이어 행동과 `enemy_turn`을 배치로 요청합니다.
- `apps/web/src/player/simulation-action.ts`: 선택적인 `events` 배치 필드를 액션 계약에 추가했습니다.
- `apps/web/src/player/PlayerPage.svelte`: 배치 요청은 `runManagementBatch`로 실행하고, 전투 중에는 패널을 닫지 않으며 의뢰가 전투를 시작하면 패널을 다시 열도록 했습니다.
- `apps/web/src/player/ScreenRenderer.svelte`: 전투 selector가 설치된 프로젝트에서 전투 블록이 존재하면 현재 화면 상단에 콘솔을 자동 표시합니다. selector가 없는 프로젝트는 예외를 잡아 기존 화면을 그대로 유지하며, 선언형 `combat-console` 위젯 라우팅도 추가했습니다.
- `apps/web/e2e/combat-console.spec.ts`: 의뢰 수행 → 콘솔 자동 표시 → 소모품 사용 → 공격·처치 → 승리 종료 → 콘솔 제거·서사 기록의 실제 브라우저 흐름을 추가했습니다.
- `apps/web/vite.config.ts`: 전체 검증 중 드러난 기존 Worker e2e 문제를 해결하기 위해 `wasmoon`과 SQLite WASM을 Vite 의존성 사전 번들에서 제외했습니다.
- `packages/risu/src/worker/lua.ts`: 브라우저 Worker가 Lua의 `glue.wasm` 주소를 명시적으로 사용하고, Node 테스트에서는 기존 로컬 파일 해석을 유지하도록 했습니다. Vite 비번들 UMD와 일반 ESM 양쪽의 `LuaFactory` 형태를 처리합니다.
- `packages/risu/src/assets.d.ts`: Vite의 `*.wasm?url` import 타입 계약을 추가했습니다.
- `REPORT-COMBAT-CONSOLE-2026-07-15.md`: 작업 결과와 검증 내용을 기록한 이 보고서입니다.

## 작업지시서와 다르게 한 것

전투 기능 자체는 작업지시서대로 구현했으며 카드명·장르명 분기, UI 수치 파라미터 전송, 기존 이벤트/selector 계약 변경, 컴파일러 화면 하드코딩, 문서 수정은 하지 않았습니다.

다만 최초 전체 검증에서 전투와 무관한 기존 Chromium Lua Worker 테스트 2개가 실패했습니다. 원인은 Vite가 WASM 패키지를 사전 번들하면서 첫 로드 중 페이지를 새로고침하고 `glue.wasm` 기준 경로도 잃는 것이었습니다. 작업지시서가 모든 실패를 수정하고 `pnpm verify` 전체를 통과하도록 요구하므로, `apps/web/vite.config.ts`, `packages/risu/src/worker/lua.ts`, `packages/risu/src/assets.d.ts`를 추가로 수정했습니다. 이 보정 후 해당 Chromium 테스트 2개와 Node 단위 테스트 107개가 모두 통과했습니다.

e2e 조우 데이터에는 지시서대로 HP 1·ATK 0 값을 넣었습니다. 현재 `rollQuestEncounter`가 조우 행의 수치보다 랭크 기본 수치를 사용하는 기존 동작은 금지사항에 따라 바꾸지 않았고, 첫 공격 처치와 무피해 반격을 결정적으로 만들기 위해 테스트 플레이어의 공격력과 방어력도 충분히 높게 설정했습니다.

## 검증 명령과 결과

- `pnpm --filter @simbot/modules test`: 성공. 모듈 테스트 9개 파일, 35개 테스트가 통과했고 신규 `combat/console` 계약을 검증했습니다.
- `pnpm --filter @simbot/web typecheck`: 성공. Svelte 검사 511개 파일에서 오류와 경고가 없었습니다. 최종 전체 검사에서는 512개 파일, 오류 0개·경고 0개였습니다.
- `pnpm --filter @simbot/risu test`: 성공. Lua의 Node 경로를 포함한 18개 파일, 107개 테스트가 통과했습니다.
- `pnpm exec playwright test runtime-worker.spec.ts --grep Lua`: 성공. 기존 Lua Chromium 테스트 2개가 통과했습니다.
- 저장소 루트 `pnpm verify`: 최종 성공, 종료 코드 0. 14개 워크스페이스 타입 검사, 전체 단위 테스트 411개, 프로덕션 빌드, `workers: 1` 직렬 Chromium e2e 32개가 모두 통과했습니다. 신규 전투 콘솔 e2e와 전투 모듈이 없는 기존 여관 e2e도 함께 통과했습니다.

검증 환경의 PowerShell PATH에는 전역 `pnpm` 명령이 없어 Corepack 10.34.1용 임시 shim을 PATH에 추가해 같은 `pnpm verify`를 실행했습니다. 임시 shim과 서버 로그는 검증 후 모두 삭제했습니다.
