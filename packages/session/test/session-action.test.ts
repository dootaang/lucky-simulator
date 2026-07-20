import { describe, expect, it } from "vitest";
import { defaultCardPreset } from "@simbot/risu";
import { ProjectRuntime } from "@simbot/runtime";
import { PlaySession } from "../src/index.ts";
import { SessionActionQueue, type SessionRevisionCursor } from "../src/session-action.ts";

const cursor = (turn: number): SessionRevisionCursor => ({ turn, eventCursor: turn, engineRevision: `rev-${turn}` });

describe("session action queue", () => {
  it("serializes actions and attaches a monotonic sequence with revision cursors", async () => {
    const queue = new SessionActionQueue(), order: string[] = [];
    queue.bind("chat-a");
    const run = async (command: { id: string; actionSequence: number }) => {
      order.push(`start:${command.id}`);
      await Promise.resolve();
      order.push(`end:${command.id}`);
      return { value: [command.id], parent: cursor(command.actionSequence - 1), next: cursor(command.actionSequence) };
    };
    const [first, second] = await Promise.all([
      queue.execute({ id: "one", params: {}, mode: "ledger" }, run),
      queue.execute({ id: "two", params: {}, mode: "narrated" }, run),
    ]);
    expect(order).toEqual(["start:one", "end:one", "start:two", "end:two"]);
    expect(first).toMatchObject({ status: "applied", result: { sessionId: "chat-a", actionSequence: 1, parent: { engineRevision: "rev-0" }, next: { engineRevision: "rev-1" } } });
    expect(second).toMatchObject({ status: "applied", result: { sessionId: "chat-a", actionSequence: 2 } });
  });

  it("does not run a queued command after a chat switch", async () => {
    const queue = new SessionActionQueue();
    queue.bind("chat-a");
    let release!: () => void, secondRuns = 0;
    const gate = new Promise<void>((resolve) => release = resolve);
    const first = queue.execute({ id: "slow", params: {}, mode: "ledger" }, async () => {
      await gate;
      return { value: [], parent: cursor(0), next: cursor(1) };
    });
    const second = queue.execute({ id: "queued", params: {}, mode: "ledger" }, async () => {
      secondRuns += 1;
      return { value: [], parent: cursor(1), next: cursor(2) };
    });
    queue.bind("chat-b");
    release();
    expect(await first).toMatchObject({ status: "stale", sessionId: "chat-a" });
    expect(await second).toMatchObject({ status: "stale", sessionId: "chat-a" });
    expect(secondRuns).toBe(0);
  });

  it("rejects use before a session is bound", async () => {
    const queue = new SessionActionQueue();
    await expect(queue.execute({ id: "x", params: {}, mode: "ledger" }, async () => ({ value: [], parent: cursor(0), next: cursor(1) }))).rejects.toThrow("session_action_unbound");
  });

  it("keeps the real engine journal and RNG identical to the direct path", async () => {
    const project = { projectId: "action-contract", schema: { progression: { baseExp: 10 }, initialState: { player: { level: 1, exp: 0 } } }, screens: [], navigation: [], content: {}, featureToggles: {}, moduleIds: ["core.progression"] },
      make = () => new PlaySession({ id: "action-contract", runtime: new ProjectRuntime(project, 77), preset: defaultCardPreset(), card: { name: "Test" }, provider: { async complete() { return { text: "unused" }; } } }),
      direct = make(), throughContract = make(), queue = new SessionActionQueue();
    await direct.runLedgerAction("progression/gain", { source: "train" });
    queue.bind(throughContract.id);
    const outcome = await queue.execute({ id: "progression/gain", params: { source: "train" }, mode: "ledger" }, async (command) => {
      const parent = { turn: throughContract.turn, eventCursor: throughContract.eventCursor, engineRevision: throughContract.engineRevision };
      const result = await throughContract.runLedgerAction(command.id, command.params);
      const next = { turn: throughContract.turn, eventCursor: throughContract.eventCursor, engineRevision: throughContract.engineRevision };
      return { value: result.log, parent, next };
    });
    expect(outcome).toMatchObject({ status: "applied", result: { parent: { eventCursor: 0 }, next: { eventCursor: 1 } } });
    expect(throughContract.runtime.snapshot()).toEqual(direct.runtime.snapshot());
    expect(throughContract.journal).toEqual(direct.journal);
  });
});
