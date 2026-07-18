# GFL 지휘관 레벨 시스템 결과 보고 (2026-07-18)

## 플레이에서 달라진 점

- 작전 성공 시 임무 별점에 따라 지휘관 EXP를 확정적으로 얻는다. 패배하면 EXP는 오르지 않는다.
- 지휘 콘솔 상단에서 `지휘관 Lv`, 현재 레벨 진행 바, 누적 진행을 바로 볼 수 있다.
- Lv 4/12에는 하루 출격 상한이 4/5회로 늘고, Lv 8/16에는 작전 판정에 +1/+2가 붙는다.
- 레벨이 오르면 `진급 — Lv N` 결정 카드에서 짧은 기지 진급 장면을 열 수 있다.
- Lv 20에는 표시 전용 칭호 `백전의 지휘관`이 붙는다. 자금·자원·아이템 보상은 없다.

원본 카드에는 경험치·지휘관 레벨 규칙이 없다. 임무 `diff`의 ★ 개수와 보스 필드는 원본 회수값이고,
EXP 표·레벨 곡선·출격 상한·판정 보정·칭호는 전부 Lucky 합성 규칙이다.

## 구현 결과

- 컴파일러가 `MISSION_DATA[].diff`의 ★ 개수를 `mission.stars`(0~6)로 보존한다.
- 승리 정산이 별점 EXP, 보스 1.5배, 재클리어 0.35배를 적용하고 `commanderExp`와 `levelUp`을 전투 로그에 남긴다.
- 레벨은 누적 EXP만으로 계산하며 Lv 20을 넘는 EXP도 버리지 않는다. 새 RNG 소비는 없다.
- `gfl/status`가 레벨·EXP 진행·출격 상한·판정 보정·칭호를 제공하고 `gfl/daily`와 출격 게이트가 같은 상한을 쓴다.
- 위험도 미리보기와 실제 `missionCheck`가 같은 지휘 보정을 사용한다.
- 전투 보고에 획득/누적 EXP가 표시되고, 레벨업 로그는 장면 모드 진급 카드로 이어진다.
- 전투 로그·상태 형태가 바뀌므로 직전 전투 개편과 같은 배포 창에서 구 GFL 저장을 새 회차로 한 번 격리해야 한다.

## 페이싱 검산

| 확인 항목 | 계산 | 결과 |
| --- | --- | --- |
| Lv 1→2 | 30 EXP | 누적 30에서 Lv 2 |
| 1일차 초반 0★ 첫 클리어 3회 | 10 + 10 + 10 | **1일차 Lv 2 도달** |
| Lv 4 도달 | 누적 150 EXP | 하루 작전 4회 |
| Lv 8 도달 | 누적 630 EXP | 작전 판정 +1 |
| Lv 12 도달 | 누적 1,430 EXP | 하루 작전 5회 |
| Lv 16 도달 | 누적 2,550 EXP | 작전 판정 +2 |
| Lv 20 도달 | 누적 3,990 EXP | `백전의 지휘관`, 다음 요구치 없음 |

실카드 정적 회수 결과는 임무 48개, 별점이 1개 이상인 임무 44개, ★ 합계 145개였다.

| 별점 | 임무 수 |
| ---: | ---: |
| 0★ | 4 |
| 1★ | 7 |
| 2★ | 3 |
| 3★ | 12 |
| 4★ | 15 |
| 5★ | 6 |
| 6★ | 1 |

## 검증 결과 원문

### 전체 타입 검사·단위 테스트·빌드

```text
> simbot-platform@0.1.0 check C:\freetalk\simbot-simulator
> pnpm typecheck && pnpm test && pnpm build

apps/web typecheck: svelte-check found 0 errors and 0 warnings
packages/modules test: Test Files 12 passed (12)
packages/modules test: Tests 76 passed (76)
packages/compiler test: Test Files 8 passed (8)
packages/compiler test: Tests 26 passed (26)
apps/web test: Test Files 24 passed (24)
apps/web test: Tests 118 passed (118)
apps/web build: ✓ built in 5.07s
Exit code: 0
```

이 검증으로 전체 워크스페이스의 타입 계약, 지휘관 레벨 결정론, 컴파일러 별점 회수, 진급 카드와 프로덕션 빌드가 함께 정상임을 확인했다.

### 전체 브라우저 여정

```text
> simbot-platform@0.1.0 test:e2e C:\freetalk\simbot-simulator
> pnpm --filter @simbot/web test:e2e

Running 44 tests using 1 worker
✓ e2e\gfl-native.spec.ts › 소녀전선 PNG를 넣으면 별도 컴파일 질문 없이 네이티브 플레이로 바로 전환된다
44 passed (42.1s)
Exit code: 0
```

이 검증으로 실제 GFL 콘솔 상단의 `지휘관 Lv`와 `0 / 30 EXP` 표시를 포함해 기존 모바일·데스크톱 플레이 여정이 유지됨을 확인했다.

### 실카드·에셋 카나리아

```text
> @simbot/web@0.1.0 canary:gfl
{
  "card": { "name": "소녀전선:잔불", "bytes": 17077761, "embeddedAssets": 146 },
  "native": { "modules": ["genre.gfl"], "dolls": 291, "missions": 48, "echelons": 3 },
  "assetModuleTotals": {
    "modules": 3,
    "entries": 41932,
    "images": 20963,
    "centralDirectoryBytes": 3341069,
    "indexMs": 37
  },
  "totalMs": 147
}
Exit code: 0
```

별점 실측 원문:

```json
{
  "missions": 48,
  "starMissions": 44,
  "stars": 145,
  "distribution": { "0": 4, "1": 7, "2": 3, "3": 12, "4": 15, "5": 6, "6": 1 }
}
```

이 검증으로 실제 카드 48개 임무의 별점 회수와 3개 대용량 에셋 모듈 연결이 함께 정상임을 확인했다.

## 제약 및 배포 메모

- 레벨은 경제 보상을 지급하지 않는다.
- 지휘 보정은 +2, 하루 출격은 5회를 넘지 않는다.
- LLM이나 사용자 파라미터로 EXP·레벨을 주입하는 경로를 만들지 않았다.
- 구 GFL 저장은 전투 개편과 같은 배포 창에서 새 회차 격리 대상이다.
