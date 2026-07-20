import type { SessionActionResult, SessionRevisionCursor } from "./session-action.ts";

export const SESSION_SYNC_ACTION_CONTRACT = "simbot-session-sync-action/0.1" as const;

// Firebase 같은 전송 수단과 분리된 순수 데이터 계약이다. API 키·계정·네트워크를
// 모르며, 한 기기에서 내구 확정된 행동이 어느 상태에서 어느 상태로 갔는지만 말한다.
export interface SessionSyncAction {
  readonly contract: typeof SESSION_SYNC_ACTION_CONTRACT;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly deviceSequence: number;
  readonly actionId: string;
  readonly mode: string;
  readonly parent: SessionRevisionCursor;
  readonly next: SessionRevisionCursor;
  readonly recordedAt: string;
}

export type IncomingSyncDecision =
  | { readonly kind: "apply" }
  | { readonly kind: "already-applied" }
  | { readonly kind: "branch"; readonly reason: "parent_mismatch" };

function sameRevision(left: SessionRevisionCursor, right: SessionRevisionCursor) {
  return left.eventCursor === right.eventCursor && left.engineRevision === right.engineRevision;
}

export function sessionSyncActionFromResult(
  result: SessionActionResult<unknown>,
  deviceId: string,
  recordedAt: string,
): SessionSyncAction {
  if (!deviceId.trim()) throw new Error("session_sync_device_required");
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error("session_sync_time_invalid");
  return {
    contract: SESSION_SYNC_ACTION_CONTRACT,
    sessionId: result.sessionId,
    deviceId,
    deviceSequence: result.actionSequence,
    actionId: result.actionId,
    mode: result.mode,
    parent: result.parent,
    next: result.next,
    recordedAt,
  };
}

// 서버 시각이나 "마지막 저장 승리"를 사용하지 않는다. 현재 머리가 행동의 부모와
// 같을 때만 직진하고, 서로 다른 미래는 branch로 보존하도록 상위 동기화 계층에 알린다.
export function decideIncomingSync(
  current: SessionRevisionCursor,
  incoming: SessionSyncAction,
): IncomingSyncDecision {
  if (sameRevision(current, incoming.next)) return { kind: "already-applied" };
  if (sameRevision(current, incoming.parent)) return { kind: "apply" };
  return { kind: "branch", reason: "parent_mismatch" };
}
