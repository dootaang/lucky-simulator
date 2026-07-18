# 결과 보고 — 세이브 에폭 (2026-07-18)

## 사용자에게 달라지는 점

엔진 업데이트 뒤 저장 회차를 열면 기존 대화·기억·확정 상태가 사라지지 않는다. 과거 사건은 읽기 전용으로
봉인하고, 현재 코드에 필요한 상태 이주를 한 뒤 같은 채팅에서 계속 플레이한다. 채팅에는 아래 안내가 한 번
추가된다.

> 엔진이 업데이트되어 이전 기록을 봉인하고 이어갑니다. 되돌리기는 이 지점 이후부터 가능합니다.

무결성 서명이 깨진 저장과 같은 버전에서 재생 결과가 달라진 저장은 종전처럼 손상으로 격리한다.

## 구현 결과

- 엔진 사건 원장을 `simbot-event-journal/0.2`로 확장했다. 봉인 에폭, 전역 사건 번호, 경계 인덱스,
  안정 직렬화 SHA-256 `sealHash`를 저장한다. v0.1은 같은 지문에서 기존 방식으로 재생 검증하고 다음
  저장부터 v0.2가 된다.
- 업데이트 복구는 바깥 세션 `integrity`를 먼저 검증한 뒤, 서명된 head 상태를 모듈 이주에 통과시키고
  과거 원장을 재실행하지 않은 채 봉인한다. 봉인 전 상태 조회·잘라내기는 거부하고 이후 사건 번호는 이어진다.
- `migrations.seal` 계약과 등록 순서 실행기를 추가했다. 이주별 실제 변경 여부를 진단에 남기며, 예외나
  잘못된 반환은 복구를 중단한다.
- 첫 이주인 `genre.gfl`은 기존 제대 슬롯이 5칸일 때만 6칸까지 `null`로 채운다. 다른 신규 키는 만들지
  않으며 두 번 실행해도 결과가 같다.
- 봉인 경계 이전 undo/redo·대안·응답 분기를 버리고, 메시지·기억·PromptRun·카드 런타임 원장은 보존한다.
- 브라우저 제품 코드는 변경하지 않았다. 컴파일 결과를 저장소에 직접 심는 E2E 픽스처 5개는 SQLite와
  IndexedDB 중 어느 백엔드가 먼저 뜨더라도 같은 조건을 쓰도록 IndexedDB로 고정했고, 컴파일 승격 전의
  빈 채팅 저장을 제거해 네이티브 초기 상태 검증과 업데이트 이주 검증을 분리했다.

계약 타입과 SHA-256 직접 의존성 때문에 지시서 표의 핵심 파일 외에 `packages/contracts`,
`packages/runtime`, `packages/modules/src/support.ts`, 잠금 파일을 함께 갱신했다.

## 검증한 위험

- fingerprint 불일치 봉인·이주, 메시지와 기억 보존, 새 사건 추가
- 봉인 전 인덱스의 `stateAt`·`truncateTo` 거부와 전역 번호 연속
- `sealHash` 변조와 바깥 `integrity` 변조의 서로 다른 실패 경로
- v0.1 재생 호환과 v0.2 저장
- undo·대안 경계 정리와 봉인 이후 undo 정지점
- 이주 예외 시 복구 중단
- GFL 5→6칸 패딩과 2회 적용 멱등성
- 기존 500행 원장 감사 및 300턴 복구·프롬프트 평탄성 무회귀
- 브라우저 44개 전체 플레이 시나리오

## 검증 명령 결과 원문

### `corepack pnpm check`

```text
Exit code: 0
Wall time: 51.1 seconds

> simbot-platform@0.1.0 check C:\freetalk\simbot-simulator
> pnpm typecheck && pnpm test && pnpm build

packages/ui typecheck: svelte-check found 0 errors and 0 warnings
apps/web typecheck: svelte-check found 0 errors and 0 warnings
packages/modules test: Test Files 12 passed (12)
packages/modules test: Tests 78 passed (78)
packages/session test: Test Files 23 passed (23)
packages/session test: Tests 120 passed (120)
packages/session test: runs 300 turns without growing the model context or losing restorable state
packages/session test: prompt context budget > keeps a 300-turn prompt flat while retaining the latest user message
apps/web test: Test Files 24 passed (24)
apps/web test: Tests 119 passed (119)
apps/web build: 461 modules transformed.
apps/web build: built in 5.75s
apps/web build: Done
```

빌드는 기존과 같은 `wasmoon` 브라우저 외부화 및 500kB 초과 청크 경고를 냈지만 성공했다.

### `corepack pnpm test:e2e`

```text
Exit code: 0
Wall time: 41.9 seconds

> simbot-platform@0.1.0 test:e2e C:\freetalk\simbot-simulator
> pnpm --filter @simbot/web test:e2e

Running 44 tests using 1 worker
44 passed (41.0s)
```

### 추가 집중 검증

```text
> @simbot/session@0.1.0 test
Test Files 23 passed (23)
Tests 120 passed (120)

> @simbot/modules@0.1.0 test
Test Files 12 passed (12)
Tests 78 passed (78)
```

## 검증 중 발견·수정한 사항

첫 전체 E2E에서는 컴파일 픽스처가 SQLite Worker를 완전히 차단하지 못해 IndexedDB에 심은 결과를 앱이
읽지 못했고, 실패 trace 누적 뒤 개발 서버가 종료되어 29개가 연쇄 실패했다. 기준 커밋을 별도 작업 폴더에서
대조해 원인을 분리했다. 픽스처가 SQLite Worker까지 차단하고 컴파일 전 빈 세션을 지운 뒤 집중 E2E 9개 중
9개, 최종 전체 E2E 44개 중 44개가 통과했다. 합격선을 완화하거나 경고를 숨기지 않았다.

## 문서와 후속 과제

- 결정과 금지선: `docs/adr/0005-save-epochs.md`
- 현재 설계 계약: `docs/DESIGN.md`
- 작업 메모와 용량 후속 과제: `docs/BACKLOG.md`
- 봉인 에폭 압축·중복 제거·지연 로드는 범위 밖이다. 기존 30MB 가져오기 상한을 유지한다.
