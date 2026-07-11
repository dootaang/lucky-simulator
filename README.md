# 시뮬봇 시뮬레이터 (sim-simulator)

RisuAI 계열 봇카드(.charx / .png / .jpg / .json / .risum)를 가져와 캐릭터·상태·규칙·화면을 다듬고, 결정론적 시뮬레이션으로 플레이하는 **LLM 네이티브 노코드 시뮬 메이커 + 플레이어 런타임**입니다.

현재 구현은 카드 탐색·컴파일·용사여관 및 범용 전투 런타임 단계이며, 장르 중립 모듈과 선언형 화면 구조로 점진적으로 전환하고 있습니다. 제품 정체성과 구현 경계는 [ADR 0001](docs/adr/0001-product-identity-and-platform-boundaries.md), 기술 설계 기준은 [DESIGN](docs/DESIGN.md), 작업 순서는 [BACKLOG](docs/BACKLOG.md)을 참조하세요.

- 카드 탐색은 완전 로컬입니다. 플레이 탭에서 BYOK를 설정한 경우에만, 사용자가 선택한 LLM 제공자(Gemini/OpenAI/Anthropic/Vertex AI/호환 서버)로 대화·발동 로어북·상태 요약이 전송됩니다.
- Vertex AI 제공자는 서비스 계정 JSON으로 브라우저에서 OAuth 액세스 토큰을 발급한 뒤 Vertex Gemini `generateContent` API를 호출합니다. 서비스 계정 JSON은 강력한 자격증명이므로 공용 PC에 저장하지 말고 사용 후 삭제하세요.
- 현재 버전에는 카드·프로젝트 재수출 및 공유 기능이 아직 없습니다.
- 임포트 탭의 카드 MRI는 내장 모듈·Lua·기능 신호·에셋 명명법·컴파일 누락을 먼저 진단합니다. 이후 만든 게임 스키마 초안은 검증과 사용자 승인을 모두 통과해야 메모리상의 활성 엔진 스키마가 됩니다.

## 사용

호스팅된 페이지를 열거나, `app/dist/index.html`을 브라우저에서 직접(file://) 열어 카드를 드롭하세요.

## 빌드

```
cd app
npm install
npm run build    # → app/dist/index.html (자기완결 단일 HTML)
npm run deploy   # 빌드 + Firebase Hosting 배포 (firebase CLI 로그인 필요)
```

호스팅: https://simbot-simulator.web.app

## 구조

- `app/core/` — 카드 파싱·로어북 정규화/활성화 코어 ([LorebookExtractor](https://github.com/dootaang) 계보, 수정 없이 복사)
- `app/src/` — UI (Vanilla JS): 개요 / NPC 갤러리 / 로어북 / 활성화 시뮬 / 에셋 / 엔진 / 플레이 탭
- `docs/adr/` — 제품·아키텍처 결정 기록
- `docs/DESIGN.md` — 현재 플랫폼 설계 기준
- `docs/BACKLOG.md` — 카드 표본 교차 분석을 반영한 구현 로드맵

## 라이선스

GPL-3.0-or-later — [LICENSE](LICENSE) 참조.
