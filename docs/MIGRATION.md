# 전체 마이그레이션 실행표

| 단계 | 결과 | 전환 조건 |
|---|---|---|
| A | workspace, 기준선, 공통 계약 | 기존 전체 검증 통과 |
| B | TypeScript Kernel·모듈 | 상태·로그·RNG 동등 |
| C | 카드·Risu·SimPack·세션·기억 | 무손실 왕복·300턴 통과 |
| D | Svelte 셸·UI Foundation | 기존 정적 배포 유지 |
| E | 선언형 Svelte 플레이어 | 여관·얼헌 동등 |
| F | Svelte 편집기 | SimPack 편집·미리보기 왕복 |
| G | Worker·구형 제거 | 프리징 방지·JS 구현 제거 |
| H | Tauri·최종 배포 | 웹·데스크톱 같은 fixture |

## 완료 상태 (2026-07-12)

- A~G 완료: pnpm 모노레포, TypeScript strict 계약·Kernel·장르 모듈·Risu 호환·SimPack·세션·기억·저장소·Svelte 플레이어/편집기로 전환했고 구형 `app/`, `engine/` JavaScript 구현을 제거했다.
- H 웹 경로 완료: 프로덕션 빌드와 Firebase 헤더, 실제 Chromium의 SQLite WASM+OPFS 저장·새로고침 복원 E2E를 검증했다.
- H 데스크톱 셸 완료: 같은 `apps/web/dist`를 사용하는 Tauri 2 설정을 추가했다. 현재 작업 호스트에는 Rust가 없어 네이티브 설치 파일 생성은 릴리스 환경의 별도 배포 작업으로 남긴다.
- 300턴 계약 완료: 모델 입력은 최근 40턴 범위로 제한하면서 600개 메시지, 결정론 엔진 상태와 근거 기억을 저장·복원한다.

## 비교 불변식

- 같은 seed와 사건열은 같은 상태·로그를 만든다.
- 실패한 사건은 상태와 RNG를 소비하지 않는다.
- 기존 SimPack과 세션 파일은 migration을 거쳐 열린다.
- Risu 무편집 내보내기는 원본 바이트를 보존한다.
- 기억은 근거·유효 시점·공개 범위를 잃지 않는다.
- 화면 행동은 등록된 엔진 이벤트만 발생시킨다.
