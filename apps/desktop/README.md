# SimBot Desktop

웹 플레이어·편집기를 그대로 사용하는 선택형 Tauri 2 셸이다. 별도의 화면이나 엔진을 복제하지 않는다.

- 준비: Rust stable과 운영체제별 Tauri 필수 구성요소 설치
- 개발: `pnpm --filter @simbot/desktop dev`
- 배포 번들: `pnpm --filter @simbot/desktop bundle`

Rust가 없는 환경에서도 루트의 `pnpm check`는 웹 제품을 검증할 수 있도록 데스크톱 번들 생성을 자동 실행하지 않는다.
