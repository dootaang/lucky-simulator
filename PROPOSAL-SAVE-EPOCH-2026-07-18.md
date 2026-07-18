# 제안서 — 세이브 에폭: 업데이트를 넘어 생존하는 저장 회차 (2026-07-18)

상태: 오너 발의("배포 후 유저에게 매번 초기화를 요구할 수 없다") → 지휘자 설계. 승인 시 구현.
채택되면 ADR로 승격 권고(원장 계약 변경이므로).

## 1. 문제

세션 복구는 원장의 **전 사건을 현재 코드로 재실행**해 저장 당시의 로그·상태 해시·RNG와 대조한다
(`packages/session/src/journal.ts` restore — 디싱크 0과 변조 감지의 근거). 따라서 이벤트 규칙이
바뀌는 모든 업데이트에서 정상 저장이 `journal_corrupt`로 격리되고, 스키마 지문 변경은
`session_schema_incompatible`로 격리된다. 개발기엔 수용했으나 배포 후엔 불가능한 비용이다.

핵심 충돌: **재생 검증(무결성)** vs **핸들러 진화(업데이트)**. 이벤트 소싱의 고전 문제이며,
표준 해법은 "과거를 다시 실행하지 않는 것" — 스냅샷 봉인 + 상태 이주다.

## 2. 설계 — 에폭 봉인

### 계약 변경 (`simbot-event-journal/0.2`)

```text
EngineJournalData v0.2
├─ contract: "simbot-event-journal/0.2"
├─ engineVersion: string            ← 신규: 이벤트 의미 버전(아래 §4)
├─ sealedEpochs: [                  ← 신규: 재실행하지 않는 과거
│    { engineVersion, schemaHash, initial, events[], head,
│      sealedAt(논리시간), sealHash }   # sealHash = 에폭 직렬화 전체의 SHA-256
│  ]
├─ initial / events[] / head / cursor / snapshots  ← 기존과 동일: "현재 에폭"만 담당
```

- **현재 에폭**: 지금과 완전히 동일하게 전 사건 재실행 검증. 무결성 보증 무손실.
- **봉인 에폭**: 재실행하지 않는다. 대신 `sealHash`로 변조 감지(읽기 전용 기록 — 대화·영수증·
  사건 이력 표시에 계속 사용). undo/분기(`truncateTo`/`stateAt`)는 현재 에폭 안으로 제한
  — 실사용 undo는 이미 최근 30턴 체크포인트라 체감 손실이 거의 없다.

### 복구 흐름 (session restore)

```text
1. integrity(스냅샷 서명) 검증 실패        → 지금처럼 격리 (진짜 손상/변조)
2. engineVersion·schemaHash 일치           → 기존 그대로 전체 재생 검증 (fast path)
3. 불일치 (= 업데이트로 열림)              → 봉인·이주 경로:
   a. 저장본의 head 상태를 그대로 신뢰 근거로 채택 (저장 시점에 검증·서명된 상태다)
   b. 구 원장 전체를 sealedEpochs에 봉인 (sealHash 계산)
   c. 상태 이주 파이프라인 실행 (§3) — 실패 항목은 보고하고 안전 기본값, 조용한 확정 금지
   d. 이주된 상태를 새 에폭의 initial로 삼아 빈 events로 재개
   e. 진단 콘솔에 "에폭 봉인: v1.5.0→v1.6.0, 이주 N건" 기록 + 채팅에 시스템 안내 1줄
```

구분 원칙: **integrity 서명이 깨졌으면 손상(격리), 서명은 멀쩡한데 버전이 다르면 진화(봉인·이주)**.
재생 발산을 손상 판정에 쓰는 현행 로직은 "버전이 같을 때"에만 적용된다.

### 3. 상태 이주 파이프라인

모듈 계약의 `migrations`(DESIGN.md에 설계만 있고 전부 빈 상태)를 가동한다.

```ts
// 모듈 정의에 실제 등록 — 첫 실사용 사례:
migrations: {
  "gfl:1.4.0->1.5.0": (state) => {   // 제대 5칸 → 6칸
    for (const e of state.gfl.echelons) while (e.slots.length < 6) e.slots.push(null);
    return state;
  },
}
```

- 레지스트리가 engineVersion 경로를 따라 순차 적용(1.3→1.4→1.5 체인). 미지 경로는 무이주 통과
  + 경고. 이주 함수는 순수 함수·RNG 금지·테스트 필수.
- 스키마 재컴파일(카드는 열 때마다 최신 템플릿 적용)과 상태 이주는 별개다 — 이주는 **상태**만 만진다.

### 4. engineVersion의 정의

"이벤트 의미가 바뀌면 올린다"를 코드로 강제하기는 어렵다. 운영 규칙으로:

- 전역 상수 `ENGINE_COMPAT_VERSION` (kernel) + GFL은 기존 `GFL_TEMPLATE_VERSION` 활용.
- **작업지시서 표준 항목화**: 이벤트 로그·상태 형태를 바꾸는 지시서는 버전 범프 + 이주 함수 +
  이주 테스트를 완료 조건에 포함한다(이 규칙을 CLAUDE/BACKLOG 규약에 명문화).
- 범프 없이 의미가 바뀌면? 같은 버전의 재생 발산 → 현행대로 격리 — 즉 안전 쪽으로 실패한다.

### 5. 범위 밖 (이번 제안에서 하지 않는 것)

- 봉인 에폭 내부로의 시간여행 재개(봉인 순간의 상태 열람은 가능, 그 이전 분기는 불가)
- 원장 압축·용량 최적화(후속 — 봉인 에폭은 이미 재실행이 없어 lazy 로드 후보)
- Risu 카드 런타임 원장(`card-runtime-journal`)의 에폭화 — 동일 패턴 적용 가능, 2단계로

## 6. 구현 스케치

| 구획 | 내용 | 규모 |
|---|---|---|
| `packages/session/journal.ts` | v0.2 계약, sealedEpochs, 봉인·이주 경로, v0.1 로드 호환 | 중 |
| `packages/kernel` | ENGINE_COMPAT_VERSION, migrations 실행기 | 소 |
| `packages/modules/gfl.ts` | 첫 이주 함수(5→6칸 등) 등록 | 소 |
| `packages/session/index.ts` | restore 분기(손상 vs 진화), 진단·안내 | 중 |
| 테스트 | 봉인 왕복·sealHash 변조 감지·이주 체인·v0.1 하위호환·undo 경계 | 중 |
| e2e | "버전 범프 시뮬레이션 → 새로고침 → 같은 채팅 이어짐" | 소 |

추정 규모: 코덱스 위임 1건(중형). 상세 지시서는 승인 후 작성.

## 7. 채택 시 효과와 우선순위 논거

- 이후 모든 WP-G4 배포(다단계 작전 등)에서 **오너·유저 세이브가 생존**한다. 다단계 작전이
  먼저 나가면 그 배포가 또 한 번 전체 격리를 일으키므로, **에폭을 1차 묶음보다 먼저** 얹는 것이
  이득이 가장 크다.
- Phase 3(커뮤니티 베타)의 전제 조건으로 승격 권고 — "업데이트=초기화"인 제품은 베타를 못 연다.
