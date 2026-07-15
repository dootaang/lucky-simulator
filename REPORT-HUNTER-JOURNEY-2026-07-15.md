# 헌터 여정 완주 구현 보고서

## 사용자 변화

- 헌터 장르를 컴파일하면 `헌터 협회`, `게이트`, `파티` 3개 기본 화면과 내비게이션이 나타난다.
- 플레이어는 협회에서 등록과 등급 평가를 하고, 게이트 화면에서 게이트를 선택해 수락·공략할 수 있다.
- 조우가 선언된 게이트를 공략하면 기존 전투 콘솔이 자동으로 나타난다. 승리 전에는 클리어 보고가 거부되고, 승리 후에만 보고와 정산이 이어진다.
- 정산 결과는 골드와 경험치가 각각 얼마 늘었는지 엔진 영수증으로 확인할 수 있다.
- 헌터 상태에는 현재 등록·평가·공략·클리어·정산 가능 여부와 다음 행동을 설명하는 한국어 이유가 표시된다.
- 조우 데이터가 없는 기존 게이트는 이전처럼 전투 증명 없이 클리어할 수 있다.

## 변경 파일 목록

- `packages/modules/src/catalog.ts`: 공개 `screenPresetsFor(moduleIds)` 함수와 여관·헌터 화면 프리셋 추가
- `packages/modules/src/hunter.ts`: 게이트 조우, `hunter/gate-raid`, 승리 증명, 상태 가능 여부·이유, 정산 사실 로그 추가
- `packages/modules/test/catalog.test.ts`: 여관 프리셋 deepEqual 무회귀와 헌터 3화면 테스트 추가
- `packages/modules/test/hunter.test.ts`: 게이트 공략·승리 증명·하위 호환·셀렉터·대표 루프 테스트 확장
- `packages/compiler/src/index.ts`: 컴파일러 화면 하드코딩을 `screenPresetsFor` 호출로 교체
- `packages/compiler/package.json`: `@simbot/modules` 워크스페이스 의존성 추가
- `pnpm-lock.yaml`: 컴파일러의 워크스페이스 의존성 잠금 반영
- `apps/web/e2e/hunter-journey.spec.ts`: 등록부터 전투와 정산 영수증까지의 브라우저 완주 테스트 추가
- `REPORT-HUNTER-JOURNEY-2026-07-15.md`: 본 보고서

## 설계 결정

- `hunter.gates[].encounter`는 적을 직접 선언하는 `{ chance?, enemies: [...] }` 형태를 선택했다. 별도의 랭크별 기본 스탯 표를 복제하지 않아 구현이 단순하고, 게이트 데이터만 읽어도 실제 적 구성을 알 수 있기 때문이다.
- `chance` 기본값은 100으로 두었다. 확률 판정에서 조우가 발생하지 않으면 전투 없이 공략 완료 증명을 남겨 클리어가 막히지 않도록 했다.
- 전투 연결은 `inn.ts`의 전례와 같은 `c.registry.dispatch(..., { id:'start_encounter' })` 배관을 사용했다. `combat.questId`는 `gate:<게이트 id>`로, `combat.gateId`는 원래 게이트 id로 저장해 `combat.ts` 수정 없이 승리 증명을 재사용했다.
- 조우가 선언된 게이트의 클리어 조건은 같은 `gate:<id>`의 `pendingQuest.cleared === true`로 고정했다. 클리어 보고 성공 시 `pendingQuest`를 정리한다.
- 화면 행동은 모두 선언형 공용 위젯의 장부 모드로 선언했다. 한 화면에서 여정을 계속 진행하면서 클릭마다 엔진 영수증을 남기기 위한 선택이다.
- 정산 성공의 첫 `hunter/settle` 로그는 유지하고, 공용 영수증이 읽을 수 있는 `gold_delta`와 `exp_gain` 사실 로그를 뒤에 확장했다. 기존 이벤트 입력과 첫 로그 호환성은 유지된다.
- `genre.inn` 화면 객체는 기존 컴파일러 `screensFor`의 속성 순서와 값까지 동일하게 옮겼고 deepEqual 테스트로 고정했다.

## 지시서와 달리한 것

- 구현 범위에서 달리한 것은 없다. 금지된 `combat.ts`, `inn.ts`, 레거시 `screens()`, `resolveModules`, `synthesizeInn`, 예제, 기존 문서, 앱 플레이 뷰 컴포넌트는 수정하지 않았다.
- 공용 선언형 렌더러는 selector의 `can*` 값을 버튼 `enabled`에 연결하는 기능이 없다. 지시서가 허용한 방식대로 버튼은 상시 노출하고, 잘못된 순서는 엔진 거부 영수증으로 설명한다.
- 검증 환경의 PATH에는 `pnpm` 실행 파일이 없어 저장소 지정 pnpm 10.34.1을 Corepack으로 호출했다. 최종 전체 검증에서는 개발 서버를 먼저 실행해 Playwright가 재사용하게 했으며, workers 1 설정과 테스트 내용은 변경하지 않았다.

## 검증 결과

- 저장소 루트 `pnpm verify`: 종료 코드 0, 67.9초
- 타입 검사: 14개 워크스페이스 프로젝트 통과. Svelte 검사 0 errors, 0 warnings
- 단위 테스트: 총 440개 통과
  - `@simbot/modules`: 10 files, 43 tests 통과
  - `@simbot/compiler`: 4 files, 11 tests 통과
  - `@simbot/web`: 22 files, 92 tests 통과
  - 그 밖의 kernel/runtime/session/contracts 등 전체 패키지 테스트 통과
- 빌드: `apps/web` Vite 프로덕션 빌드 통과, 446 modules transformed
- e2e: workers 1에서 총 34개 통과 — 기존 33개와 신규 헌터 여정 1개 모두 성공
- 신규 헌터 e2e가 확인한 흐름: 등록 → 결정론 등급 평가(D급 표시) → 파티 화면 → 게이트 선택·수락 → 공략 → 전투 콘솔 등장 → 공격·승리 종료 → 클리어 보고 → 정산 → 골드 `+50`, 경험치 `+5` 영수증
