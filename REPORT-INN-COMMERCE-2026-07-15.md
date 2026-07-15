# 여관 상거래·채집·숙박 일괄 복구 보고서

## 사용자에게 보이는 변화

- 여관 경영 화면에서 판매 메뉴의 가격과 1개당 소모 재고를 보고 수량을 정해 즉시 판매할 수 있다. 잠긴 메뉴와 재고가 부족한 메뉴는 이유와 함께 비활성화된다.
- 구매 전용 소지품의 가격과 현재 보유량을 보고 즉시 구매할 수 있다. 골드가 부족하면 부족액이 표시되고 구매할 수 없다.
- 현재 보유 자원마다 소규모·중규모·대규모 채집 버튼이 표시되며, 채집 결과는 엔진이 계산한 뒤 한 장면의 서사로 기록된다.
- 숙박 문의가 있을 때 가능한 문의를 한 번에 수락하거나 남은 문의를 한 번에 거절할 수 있다. 묶음 전체는 서사 한 번으로 기록되며 기존 개별 수락·거절 버튼도 유지된다.
- 메뉴·채집 실패 코드가 한국어 안내로 표시된다.

## 변경하거나 만든 파일

- `packages/modules/src/inn.ts`: `inn/management` 결과에 엔진 계산 기반 `menu.sell`과 `menu.buy`를 추가했다. 판매 재고 판정은 기존 `consumption()`을 그대로 호출한다.
- `packages/modules/src/common.ts`: `inventory/gather-options` 셀렉터를 추가했다.
- `apps/web/src/player/InnManagement.svelte`: 메뉴 판매, 소지품 구매, 채집, 숙박 일괄 수락·거절 UI와 한국어 실패 안내를 추가했다.
- `packages/modules/test/inn.test.ts`: 판매 재고 부족, 주방 잠김, 구매 가능 여부와 보유량 계약을 검증한다.
- `packages/modules/test/inventory.test.ts`: 채집 선택지와 gather가 없는 스키마의 빈 배열 계약을 검증한다.
- `apps/web/e2e/inn-commerce.spec.ts`: 판매 후 골드·재고 반영, 구매 후 보유량 증가, 채집 서사 기록, 숙박 일괄 수락 후 문의 소멸·객실 투숙을 검증한다.
- `REPORT-INN-COMMERCE-2026-07-15.md`: 이 완료 보고서다.

## 작업지시서와 달리한 점

- 구현상 달리한 점은 없다.
- 검증 환경에서는 `pnpm` shim이 기본 PATH에 없어서 Corepack의 `pnpm.cmd`를 PATH에 추가했다. 또한 Windows에서 Playwright가 직접 띄운 Vite 하위 프로세스의 종료 대기가 남는 현상을 피하려고 동일 셸에서 Vite를 먼저 띄우고 검증 뒤 종료했다. 저장소 설정과 Playwright worker 수는 변경하지 않았으며 실제 실행된 루트 스크립트는 그대로 `pnpm verify`다.
- 금지된 전투 관련 파일, 컴파일러, 문서, 기존 미추적 제안서와 스크린샷 3개는 수정하지 않았다. 커밋과 푸시도 하지 않았다.

## 검증 결과

- `corepack pnpm --filter @simbot/modules test` — 통과. 모듈 테스트 9개 파일, 37개 테스트가 통과해 메뉴·채집 선택자와 기존 여관 동작을 함께 검증했다.
- `corepack pnpm --filter @simbot/web typecheck` — 통과. Svelte/TypeScript 512개 파일에서 오류와 경고가 0개였다.
- `corepack pnpm --filter @simbot/web exec playwright test e2e/inn-commerce.spec.ts` — 신규 시나리오 통과. 판매·구매·채집·숙박 일괄 동선이 실제 화면과 저장된 서사에 반영됨을 검증했다.
- `pnpm verify` — 최종 정상 종료(Exit code 0). 전체 타입 검사, 전체 단위 테스트, 프로덕션 빌드가 통과했고 Playwright는 기존 설정대로 worker 1개에서 33개 전부 통과했다. 신규 `inn-commerce.spec.ts`도 이 전체 실행에 포함돼 통과했다.
