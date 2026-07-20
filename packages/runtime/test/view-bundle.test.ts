import { describe, expect, it } from "vitest";
import { ModuleRegistry, type ModuleDefinition, type RuntimeRecord } from "@simbot/kernel";
import { ProjectRuntime } from "../src/index.ts";

const module = (): ModuleDefinition => ({
  id: "test.bundle",
  version: "1.0.0",
  dependencies: [],
  stateAccess: { owns: ["gold"], reads: ["gold"], writes: ["gold"] },
  events: {
    "count/add": ({ state }: { state: RuntimeRecord }) => ({ state: { ...state, gold: Number(state.gold ?? 0) + 1 }, log: [{ ok: true, event: "count/add" }] }),
  },
  selectors: {
    "count/summary": (...args: unknown[]) => ({ count: (args[1] as RuntimeRecord).gold }),
  },
  migrations: {},
});

describe("runtime view bundle", () => {
  it("returns genre-neutral selector values and isolates missing selectors", () => {
    const registry = new ModuleRegistry().register(module()), runtime = new ProjectRuntime({ projectId: "multi-bot", schema: { initialState: { count: 0 } }, screens: [], navigation: [], content: {}, featureToggles: {}, moduleIds: [] }, 1, registry);
    const before = runtime.selectBundle(["count/summary", "missing", "count/summary"]);
    expect(before).toEqual({ projectId: "multi-bot", revision: 0, values: { "count/summary": { count: 0 } }, errors: { missing: "unknown_selector:missing" } });
    runtime.dispatch("count/add");
    expect(runtime.selectBundle(["count/summary"])).toMatchObject({ revision: 1, values: { "count/summary": { count: 1 } }, errors: {} });
  });
});
