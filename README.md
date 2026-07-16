# 럭키★시뮬레이터 (Lucky Simulator)

> **LLM은 이야기를, 엔진은 사실을.**

리스AI(RisuAI) 시뮬봇 카드를 그대로 가져와, **수백 턴을 굴려도 상태가 어긋나지 않는** 곳입니다.

리스에서 시뮬봇을 오래 굴리면 LLM이 숫자를 잊거나 지어내 상태가 무너집니다. 럭키★엔진은 상태(골드·자원·호감도·날짜)를 **엔진이 소유**하고, LLM이 본문에 남긴 태그를 엔진 이벤트로 번역해 확정합니다. 그래서 300턴을 돌려도 **디싱크 0**이고, 되돌리기는 글이 아니라 **상태를 통째로 복원**합니다. 확정된 사실은 매 턴 **★사실 영수증**으로 보여줍니다.

- 브랜드 규범: [docs/BRANDING.md](docs/BRANDING.md) · 정체성: [ADR 0002](docs/adr/0002-lucky-simulator-risu-compatible-player.md) · 로드맵: [docs/ROADMAP.md](docs/ROADMAP.md) · [소녀전선 지원](docs/GIRLS-FRONTLINE.md)

## 현재 구조

- `apps/web` — Svelte 5 플레이어와 편집기
- `apps/desktop` — 같은 웹 제품을 감싸는 선택형 Tauri 2 셸
- `packages/kernel` — 결정론적 RNG, 상태 생성, 모듈 레지스트리
- `packages/modules` — 공통 RPG·전투·헌터·여관 장르 규칙
- `packages/card` — JSON·PNG·CharX·Risum 카드 파서
- `packages/compiler` — 근거 기반 SimPack 초안 컴파일러
- `packages/risu` — 페르소나·프롬프트·로어북·안전 정규식 호환 계층
- `packages/session` — 장기 채팅, 엔진 이벤트 검증, 기억 조립
- `packages/memory` — 근거·유효기간·범위를 갖는 lexical/Voyage 혼합 검색
- `packages/persistence` — SQLite WASM + OPFS Worker, IndexedDB fallback
- `packages/simpack` — 이식 가능한 프로젝트 컨테이너

## 개발

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm dev
```

프로덕션 산출물은 `apps/web/dist`에 생성됩니다. `pnpm deploy`는 이 디렉터리를 Firebase Hosting에 배포합니다.

데스크톱 번들은 Rust stable과 Tauri 운영체제 의존성을 설치한 환경에서 `pnpm --filter @simbot/desktop bundle`로 생성합니다. 웹과 데스크톱은 별도 엔진이나 화면을 만들지 않고 같은 산출물을 사용합니다.

## 안전 원칙

- 카드의 산문만으로 장르 실행 모듈을 자동 설치하지 않습니다.
- LLM은 제작자가 화면 버튼 또는 프로젝트 옵션으로 공개한 이벤트만 제안할 수 있습니다. 엔진에 등록됐더라도 공개하지 않은 내부 이벤트는 거부합니다.
- 등급 평가·전투 피해·보상처럼 엔진이 계산하는 값은 LLM 매개변수로 덮어쓸 수 없습니다.
- 엔진 결과만 승인 기억이 되며, 서사에서 추출한 기억은 승인 전까지 검색되지 않습니다.
- Lua·CJS·MCP·저수준 trigger는 보존·진단할 수 있지만 자동 실행하지 않습니다.

라이선스와 외부 프로젝트의 출처는 [THIRD_PARTY_PROVENANCE.md](docs/THIRD_PARTY_PROVENANCE.md)를 참고하세요.
