# 카드 Lua 런타임 역량표

상태: 구현됨, 제품 배선은 비활성. 이 문서는 ADR 0004의 M-D 실행 정책을 코드 수준으로 구체화한다.

## 기본 원칙

- Lua는 세션 전용 Worker 안에서만 실행한다.
- 요청의 `capabilities.lua`가 정확히 `true`일 때만 실행한다. 생략과 `false`는 동일하게 차단한다.
- Worker는 안전한 네트워크 경계가 아니다. Worker에도 `fetch`, IndexedDB 등이 있으므로 Lua VM에 객체를
  노출하지 않는 화이트리스트가 실제 보안 경계다.
- Lua가 돌려주는 것은 변수 patch뿐이다. 메인 세션이 revision, requestId, 상태 소유권을 다시 검증한 뒤
  원자적으로 적용·저널링한다.

## 허용

| API | 용도 |
|---|---|
| `getChatVar(id, key)` / `getvar(key)` | 현재 세션 카드 변수 읽기 |
| `setChatVar(id, key, value)` / `setvar(key, value)` | 호환 모드 카드 변수 쓰기 |
| `getState(id, key)` / `setState(id, key, value)` | `__` 접두 변수의 최소 호환 별칭 |
| Lua 기본 산술·문자열·테이블 함수 | 변수 계산 |

완전 시뮬 모드에서는 계산은 복사본에서 수행하되 모든 쓰기 patch를 폐기하고
`runtime_state_write_blocked`를 기록한다.

## 기본 차단

네트워크 요청, LLM 호출, 저장소·파일, DOM/window, 이미지 생성, 채팅 편집, 로어북 변경, 캐릭터·페르소나
변경, 엔진 사건 직접 실행, 다른 카드·채팅 접근은 전부 차단한다. 알려진 Risu API 이름은 호출 즉시
`runtime_lua_capability_blocked`로 거래 전체를 폐기한다. 알려지지 않은 함수도 Lua 환경에 노출되지 않는다.

표준 Lua의 `io`, `os`, `package`, `require`, `dofile`, `loadfile`, `load`, `debug`도 사용자 코드 실행 전에
제거한다. wasmoon은 `injectObjects:false`, `enableProxy:false`로 생성한다.

## 실행 예산

- Lua VM 추적 메모리: 16 MiB
- Lua 명령: 100,000회(1,000회마다 훅 검사)
- Worker 카드 실행: 소프트 250ms 진단, 하드 1초 강제 종료
- 최초 WASM 준비: 최대 10초. 준비 완료 신호 뒤부터 카드 실행 1초를 별도로 잰다.
- 기존 런타임 공통 입력·출력·patch 구조 상한도 그대로 적용한다.

상한 초과, 금지 역량 호출, 오류가 나면 그 요청에서 계산된 patch는 하나도 적용하지 않는다.
