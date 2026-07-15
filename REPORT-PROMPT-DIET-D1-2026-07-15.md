# 프롬프트 다이어트 D1 작업 보고서 (2026-07-15)

## 사용자에게 달라지는 점

- 새 기본값으로 최근 대화에 24,000 토큰 예산이 적용되어, 긴 플레이에서도 모델 요청 크기가 계속 커지지 않고 일정하게 유지됩니다.
- 예산을 넘으면 Risu처럼 오래된 대화부터 모델 프롬프트에서 제외되지만, 잘린 대화도 화면의 대화 기록과 저장 로그에는 전부 남습니다.
- 설정의 `최대 문맥 토큰`에서 `0`을 입력하거나 값을 비우면 무제한으로 저장되므로, 사용자가 언제든 이전의 무제한 동작으로 되돌릴 수 있습니다.
- 이미 `maxContext`를 저장한 사용자의 값은 새 기본값으로 덮어쓰지 않고 그대로 사용합니다.

## 변경 파일

- `apps/web/src/player/PlayerPage.svelte`
  - 기본 `maxContext`를 24,000으로 설정했습니다.
  - `maxContext` 입력만 빈 문자열을 `0`으로 저장하고, 다른 숫자 설정의 빈 값은 기존처럼 `undefined`로 유지했습니다.
- `apps/web/src/player/SettingsPanel.svelte`
  - 최대 문맥 토큰 범위에 `0`을 허용했습니다.
  - 오래된 대화 우선 절단, `0 = 무제한`, 절단된 대화의 기록 보존을 안내합니다.
  - 최대 문맥 토큰의 빈 값과 무제한 버튼이 `0` 저장 계약을 분명히 보여주도록 정리했습니다.
- `packages/session/test/prompt-context-flatness.test.ts`
  - 고정 응답 mock `ModelProvider`로 실제 300턴을 실행하는 평탄성 회귀 테스트를 추가했습니다.
  - 300턴 요청 토큰이 50턴 대비 10% 이내인지, 모든 턴이 고정 블록 + 24,000 + 여유 한도를 지키는지, 최신 사용자 메시지가 매번 포함되는지 검증합니다.
  - `maxContext=0`일 때 24,000 토큰을 넘어도 과거 대화가 절단되지 않는지 검증합니다.
- `REPORT-PROMPT-DIET-D1-2026-07-15.md`
  - 이 작업 결과와 검증 내역을 기록했습니다.

## 작업지시서와 달리한 점

- 구현 편차는 없습니다. 300턴 실행 시간이 약 10초여서 턴 수를 낮추지 않았습니다.
- 금지된 세션 절단 알고리즘, 프롬프트 블록 구성·순서, `presets.ts`, 모듈·컴파일러·헌터 E2E, 기존 문서는 수정하지 않았고 카드명 분기도 추가하지 않았습니다.
- 검증 실행 메모: 이 Windows 실행 환경에서는 Playwright가 직접 띄운 Vite 서버의 종료 정리에서 멈춰, E2E 34개 성공 뒤에도 일반 셸 호출이 반환되지 않는 현상이 두 번 재현됐습니다. Playwright 설정은 변경하지 않았으며, 설정에 이미 있는 `reuseExistingServer: true` 계약대로 동일한 Vite 서버를 먼저 띄워 `pnpm verify`를 다시 실행하자 정상 종료했습니다.

## 검증 결과

- `pnpm --filter @simbot/session test -- prompt-context-flatness.test.ts`: 통과. 세션 테스트 파일 19개, 테스트 103개가 모두 통과했고 신규 300턴 평탄성·무제한 케이스도 통과했습니다.
- `pnpm --filter @simbot/session typecheck`: 통과.
- `pnpm --filter @simbot/web typecheck`: 통과. Svelte 검사 0 errors, 0 warnings.
- `pnpm verify`: 통과.
  - 전체 워크스페이스 타입 검사 통과.
  - 전체 단위 테스트 통과. 세션의 기존 `play-parity-prompt`와 prompt hash 관련 회귀를 포함해 실패나 golden divergence가 없었습니다.
  - 프로덕션 빌드 통과.
  - Playwright E2E 34/34 통과, `workers: 1` 유지.
