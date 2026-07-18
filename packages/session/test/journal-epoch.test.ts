import { describe, expect, it } from "vitest";
import { ModuleRegistry, type ModuleDefinition } from "@simbot/kernel";
import { defaultCardPreset } from "@simbot/risu";
import { ProjectRuntime, type RuntimeProject } from "@simbot/runtime";
import { PlaySession, sessionIntegrity, type SessionSnapshot } from "../src/index.ts";

const provider = {
  async complete() {
    return { text: "기록을 남겼다.", events: [{ id: "test/inc" }], memories: [{ text: "이전 에폭의 기억" }] };
  },
};

function project(revision: number, step: number): RuntimeProject {
  return {
    projectId: "epoch-test",
    schema: { revision, step, initialState: { count: 0 } },
    screens: [], navigation: [], content: {}, featureToggles: {}, moduleIds: [], modelEventIds: ["test/inc"],
  };
}
function module(migration: "ok" | "throw" = "ok"): ModuleDefinition {
  return {
    id: "test.epoch", version: "1.0.0", stateAccess: { owns: ["count"], reads: [], writes: [] },
    events: {
      "test/inc": (context) => {
        context.state.count = Number(context.state.count ?? 0) + Number(context.schema.step ?? 1);
        return { state: context.state, log: [{ ok: true, event: "test/inc", count: context.state.count }] };
      },
    },
    migrations: {
      seal: migration === "throw"
        ? () => { throw new Error("test_seal_boom"); }
        : (state) => ({ ...state, migrated: true }),
    },
  };
}
function session(revision: number, step: number, migration: "ok" | "throw" = "ok") {
  const registry = new ModuleRegistry().register(module(migration));
  return new PlaySession({
    id: "epoch-session",
    runtime: new ProjectRuntime(project(revision, step), 7, registry),
    preset: defaultCardPreset(), card: { name: "Epoch" }, provider,
  });
}
function resign(snapshot: SessionSnapshot) {
  const base = structuredClone(snapshot) as SessionSnapshot;
  delete (base as Partial<SessionSnapshot>).integrity;
  base.integrity = sessionIntegrity(base);
  return base;
}

describe("save epochs", () => {
  it("fingerprint 진화를 봉인·이주하고 메시지·기억과 전역 사건 인덱스를 이어 간다", async () => {
    const old = session(1, 1);
    await old.send("첫 기록");
    const saved = old.snapshot(), oldHead = saved.journal!.head.index;
    expect(oldHead).toBe(1);

    const current = session(2, 99);
    current.restore(saved);
    expect(current.runtime.state).toMatchObject({ count: 1, migrated: true });
    expect(current.messages.map((message) => message.content)).toEqual([
      "첫 기록", "기록을 남겼다.",
      "엔진이 업데이트되어 이전 기록을 봉인하고 이어갑니다. 되돌리기는 이 지점 이후부터 가능합니다.",
    ]);
    expect(current.memory.all().some((entry) => entry.text === "이전 에폭의 기억")).toBe(true);
    expect(current.lastLogs.at(-1)).toMatchObject({ kind: "card", code: "session_epoch_sealed", baseIndex: 1 });
    expect(current.journal).toMatchObject({ contract: "simbot-event-journal/0.2", baseIndex: 1, events: [] });
    expect(current.journal.sealedEpochs).toHaveLength(1);
    expect(current.journal.sealedEpochs[0]?.sealHash).toMatch(/^[0-9a-f]{64}$/);
    expect(() => current.stateAt(0)).toThrow(/epoch_sealed/);
    await expect(current.truncateTo(0)).rejects.toThrow(/epoch_sealed/);
    expect(current.stateAt(1).state).toMatchObject({ count: 1, migrated: true });

    current.runtime.dispatch("test/inc");
    expect(current.journal.events[0]).toMatchObject({ index: 2, parentIndex: 1 });
    expect(current.journal.sealedEpochs[0]?.events[0]).toMatchObject({ index: 1 });
    expect(current.eventCount).toBe(2);
  });

  it("봉인 경계 이전 undo·대안을 버리고 이후 undo는 경계에서 멈춘다", async () => {
    const old = session(1, 1);
    await old.send("첫 기록");
    await old.reroll();
    expect(old.checkpointDepth).toBeGreaterThan(0);
    expect(old.alternateCount).toBeGreaterThan(0);
    const current = session(2, 1);
    current.restore(old.snapshot());
    expect(current.checkpointDepth).toBe(0);
    expect(current.redoDepth).toBe(0);
    expect(current.alternateCount).toBe(0);
    await expect(current.undoTurn()).rejects.toThrow("no_checkpoint");
    await current.send("새 에폭 기록");
    await current.undoTurn();
    expect(current.eventCursor).toBe(current.journal.baseIndex);
    await expect(current.undoTurn()).rejects.toThrow("no_checkpoint");
  });

  it("sealHash 변조와 바깥 integrity 변조를 서로 다른 손상으로 거부한다", async () => {
    const old = session(1, 1);
    await old.send("첫 기록");
    const current = session(2, 1);
    current.restore(old.snapshot());
    const evolved = current.snapshot(), sealForged = structuredClone(evolved);
    (sealForged.journal as any).sealedEpochs[0].sealHash = "0".repeat(64);
    expect(() => session(2, 1).restore(resign(sealForged))).toThrow(/journal_corrupt:sealed_epoch_1_hash/);
    const integrityForged = structuredClone(evolved);
    integrityForged.messages[0]!.content = "변조";
    expect(() => session(2, 1).restore(integrityForged)).toThrow(/session_corrupt:integrity/);
  });

  it("v0.1 원장은 같은 fingerprint에서 기존 재생 검증을 그대로 통과하고 v0.2로 저장된다", async () => {
    const source = session(1, 1);
    await source.send("기록");
    const snapshot = source.snapshot(), journal = snapshot.journal!;
    const legacy = resign({
      ...snapshot,
      journal: {
        contract: "simbot-event-journal/0.1",
        schemaHash: journal.schemaHash,
        initial: journal.initial,
        snapshotInterval: journal.snapshotInterval,
        events: journal.events,
        cursor: journal.cursor,
        head: journal.head,
      },
    });
    const restored = session(1, 1);
    restored.restore(legacy);
    expect(restored.runtime.snapshot()).toEqual(source.runtime.snapshot());
    expect(restored.journal).toMatchObject({ contract: "simbot-event-journal/0.2", baseIndex: 0, sealedEpochs: [] });
  });

  it("seal 이주 예외는 복구를 중단해 기존 격리 경로로 실패한다", async () => {
    const old = session(1, 1);
    await old.send("기록");
    expect(() => session(2, 1, "throw").restore(old.snapshot())).toThrow("test_seal_boom");
  });
});
