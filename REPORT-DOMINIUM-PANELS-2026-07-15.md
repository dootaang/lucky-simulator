# 텍스트 상태창 흡수 구현 보고서 (2026-07-15)

## 사용자에게 보이는 변화

상태창을 일반 텍스트로 출력하는 카드를 열면, 이제 선언된 `라벨: 값 |` 체인이 채팅 본문에서 사라지고 시뮬레이션의 상태창 위젯으로 이동한다. 다음 응답에서 같은 상태창이 다시 나오면 기존 값이 갱신된다. 단일 필드 소식은 최근 5개까지 남으며, 상태 반영 내역에는 `panel_sync` 영수증이 기록된다.

## 변경 파일

- `packages/compiler/src/text-panels.ts`: 표시/출력 정규식 IN 패턴의 필드 체인 추출기와 선언 타입.
- `packages/compiler/src/index.ts`: 컴파일 스키마·모듈·화면·정상 진단 정보에 추출 결과 연결.
- `packages/compiler/test/text-panels.test.ts`: 9필드·15필드·단일 피드 2종과 비대상 정규식 검증.
- `packages/compiler/test/llm-compiler.test.ts`: 컴파일 산출물 승격 통합 검증 및 합성 카드 명칭 정리.
- `packages/modules/src/text-panels.ts`: `panel_sync`, `panels` 상태 소유, `panels/all`, 피드 5개 보존.
- `packages/modules/src/catalog.ts`: 모듈 카탈로그와 선택 스키마 기반 상태창 화면 생성.
- `packages/modules/src/index.ts`: 새 모듈 공개 진입점.
- `packages/modules/test/text-panels.test.ts`: 선언 검증·거부·문자열 보존·피드 제한 검증.
- `packages/modules/test/catalog.test.ts`: 기존 프리셋 무회귀와 상태창 화면 검증.
- `packages/risu/src/panel-translate.ts`: 패널 번역기와 순차 합성 순수 함수.
- `packages/risu/src/index.ts`: 번역기 공개 진입점.
- `packages/risu/src/security/budget.ts`: 금지된 실카드 고유명사가 남지 않도록 기존 주석을 범용 표현으로 정리.
- `packages/risu/test/panel-translate.test.ts`: 본문 제거·무변화·기존 태그 번역 공존 검증.
- `packages/session/src/index.ts`: 카드 태그 허용목록에 `panel_sync` 한 항목 추가.
- `packages/runtime/test/module-assembly.test.ts`: 새 내장 모듈의 카탈로그 계약 반영.
- `apps/web/src/player/PlayerPage.svelte`: 컴파일 스키마에 선언이 있을 때 기존 태그 번역기와 패널 번역기를 합성.
- `apps/web/e2e/text-panels.spec.ts`: 합성 JSON 카드와 합성 컴파일 산출물로 본문 제거·위젯·영수증·두 번째 응답 갱신 검증.
- 본 보고서: 사용자 변화, 변경 범위, 설계 판단과 검증 결과 기록.

## 설계 결정

- 추출은 카드명이나 장르명을 보지 않고, 표시/출력 정규식의 캡처 구조와 연속성만 본다.
- 정규식 comment가 있으면 정규화한 슬러그를 ID로 쓰고, 없으면 `panel-N`을 쓴다. 중복 comment는 숫자 접미사로 충돌을 막는다.
- `panel_sync`는 선언된 ID와 라벨, 문자열 값만 받는다. 숫자 변환이나 게임 규칙 추론은 하지 않는다. 부분 필드 갱신은 허용하되 미선언 라벨은 전체 이벤트를 거부한다.
- `panels/all`은 선언 순서대로 `{id, kind, fields, feed}` 뷰 모델을 돌려준다.
- 화면은 상태창 한 장에 선언별 `detail-panel` 하나를 만든다. 현재 모듈 레지스트리는 런타임 스키마에 따라 동적 selector ID를 등록하지 않으므로, 기존 화면 렌더러가 이미 지원하는 모듈 소유 상태 경로를 각 위젯에 연결했다. UI에서 값을 다시 계산하지 않는다.
- 번역기 합성은 기존 태그 번역을 먼저 적용하고 그 residue에 패널 번역을 적용한다. 두 이벤트 배열은 순서를 유지해 합친다.
- E2E는 외부 카드 파일 없이 테스트 안에서 만든 JSON과 컴파일 산출물만 사용한다.

## 작업지시서와 달리한 점

- 패널별 동적 `engine:panels/<id>` selector 대신 `state.panels.<id>` 계열 source를 사용했다. 정적 모듈 레지스트리 계약을 확장하지 않고도 선언별 위젯에 실제 값을 연결하기 위한 선택이다. 필수 전체 selector인 `panels/all`은 그대로 구현했다.
- 그 외 기능 범위의 차이는 없다. 기존 문서는 수정하지 않았고, 커밋·푸시·스크린샷·실카드 바이너리 추가도 하지 않았다.

## 검증 결과

- `pnpm verify`: 통과. 타입 검사 14개 워크스페이스 대상, 오류 0건. 단위 테스트 104파일·462개 통과. 웹 빌드 통과. E2E는 설정대로 worker 1개에서 35개 전부 통과했다.
- 새 E2E 단독 실행: 1개 통과. 상태 체인의 채팅 제거, 패널 값 표시, `panel_sync` 영수증, 두 번째 응답 갱신을 실제 브라우저에서 확인했다.
- `node --experimental-transform-types`로 `@simbot/compiler`, `@simbot/modules`, `@simbot/risu` 진입점 import: 3개 모두 통과.
- `git diff --check`: 통과.
- 코드·테스트·픽스처 금지 문자열 감사: 발견 0건.
