import { describe, expect, it } from "vitest";
import { decideIncomingSync, sessionSyncActionFromResult, type SessionActionResult, type SessionRevisionCursor } from "../src/index.ts";

const revision = (eventCursor: number, suffix = String(eventCursor)): SessionRevisionCursor => ({ turn: eventCursor, eventCursor, engineRevision: `hash-${suffix}:rng-${suffix}` });
const result: SessionActionResult<unknown> = { sessionId: "chat-a", actionSequence: 7, actionId: "gfl/time/advance", mode: "ledger", parent: revision(10), next: revision(11), value: [] };

describe("session sync contract", () => {
  it("turns an applied local action into transport-neutral sync data", () => {
    expect(sessionSyncActionFromResult(result, "phone-a", "2026-07-20T10:00:00.000Z")).toEqual({
      contract: "simbot-session-sync-action/0.1",
      sessionId: "chat-a",
      deviceId: "phone-a",
      deviceSequence: 7,
      actionId: "gfl/time/advance",
      mode: "ledger",
      parent: revision(10),
      next: revision(11),
      recordedAt: "2026-07-20T10:00:00.000Z",
    });
  });

  it("applies only a direct child and preserves divergent progress as a branch", () => {
    const incoming = sessionSyncActionFromResult(result, "phone-a", "2026-07-20T10:00:00.000Z");
    expect(decideIncomingSync(revision(10), incoming)).toEqual({ kind: "apply" });
    expect(decideIncomingSync(revision(11), incoming)).toEqual({ kind: "already-applied" });
    expect(decideIncomingSync(revision(11, "other-future"), incoming)).toEqual({ kind: "branch", reason: "parent_mismatch" });
    expect(decideIncomingSync(revision(9), incoming)).toEqual({ kind: "branch", reason: "parent_mismatch" });
  });

  it("requires an explicit device and timestamp instead of inventing nondeterministic values", () => {
    expect(() => sessionSyncActionFromResult(result, "", "2026-07-20T10:00:00.000Z")).toThrow("session_sync_device_required");
    expect(() => sessionSyncActionFromResult(result, "phone-a", "now-ish")).toThrow("session_sync_time_invalid");
  });
});
