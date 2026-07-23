import type { HudChip, HudModel } from './hud-model';
import type { DecisionCardModel } from './decision-model';

export interface ManagementSummaryModel {
  status: HudChip[];
  tasks: DecisionCardModel[];
  recentLogs: Record<string, unknown>[];
}

// 장르 이름을 보지 않는다. 각 모듈이 이미 제공하는 계기판·결정 카드·엔진 영수증을
// 같은 세 칸(지금 상태 / 지금 할 일 / 최근 결과)으로 재배치하는 것이 요약 계약이다.
export function buildManagementSummary(
  hud: HudModel,
  tasks: DecisionCardModel[],
  logs: ReadonlyArray<Record<string, unknown>>,
): ManagementSummaryModel {
  return {
    status: [...hud.fixed, ...hud.gauges].slice(0, 8),
    tasks: tasks.slice(0, 4),
    recentLogs: logs.filter((log) => log.ok !== undefined || log.event !== undefined).slice(-6),
  };
}
