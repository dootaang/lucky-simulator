// 엔진 클릭 지연 하니스 — 합성 회차에서 ledger 클릭당 비용을 계측한다.
// 목표 계약: p95 ≤ 50ms(데스크톱), 클릭 비용이 역사 길이에 비례하지 않을 것.
// 사용: corepack pnpm --filter @simbot/session perf:clicks
import { performance } from "node:perf_hooks";
import { ProjectRuntime } from "@simbot/runtime";
import type { SessionRepository, PersistedSession } from "@simbot/persistence";
import type { PromptPreset } from "@simbot/risu";
import { PlaySession, type SessionSnapshot } from "../src/index.ts";

const source = { source: "user" as const, path: "perf" };
// 임포트 프리셋을 모사: raw에 수십 KB 원본이 실린다(체크포인트 비용의 실측 재현).
const preset: PromptPreset = {
  contract: "prompt-preset/0.1", id: "perf-preset", name: "perf", compatibilityMode: "risu", version: 1,
  raw: { promptTemplate: Array.from({ length: 40 }, (_, i) => ({ type: "plain", name: `block-${i}`, text: "x".repeat(2000) })) },
  settings: { assistantPrefill: "", sendNames: false, sendChatAsSystem: false },
  blocks: [
    { id: "chat", type: "chat", name: "chat", enabled: true, rangeStart: -1000, rangeEnd: "end", source },
    { id: "facts", type: "engineFacts", name: "facts", enabled: true, role: "system", source },
  ],
};
// 상태 크기를 실전 GFL 근사로: 소유 유닛 60기 상당의 벌크 레코드.
const bulk = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`unit${i}`, {
  id: `unit${i}`, name: `Unit ${i}`, grade: (i % 5) + 1, hp: { cur: 900 + i, max: 1000 + i }, mood: 90,
  affinity: i * 3, records: { kills: i, crits: 0, guarded: 0 }, equipment: [`eq${i % 7}`], status: "대기",
}]));
function makeRuntime() {
  return new ProjectRuntime({
    projectId: "perf", schema: {
      progression: { sources: { train: [2, 2] }, thresholds: [1_000_000] },
      initialState: { player: { level: 1, exp: 0 }, roster: bulk, clock: { day: 1, turn: 0 } },
    },
    screens: [{ id: "play", regions: { actions: [{ widget: "action-group", actions: [{ event: { id: "progression/gain", params: { source: "train" } } }] }] } }],
    navigation: [], content: {}, featureToggles: {}, moduleIds: [],
  });
}
// IDB 비용 근사 저장소: put마다 구조적 클론 + 직렬화 길이 계산.
function perfRepository(): SessionRepository<SessionSnapshot> & { lastBytes: number; puts: number } {
  const rows = new Map<string, PersistedSession<SessionSnapshot>>();
  const self = {
    lastBytes: 0, puts: 0,
    health: { backend: "memory" as const, persistent: false, detail: "perf" },
    async put(value: PersistedSession<SessionSnapshot>) { self.puts += 1; self.lastBytes = JSON.stringify(value.payload).length; rows.set(value.id, structuredClone(value)); },
    async get(id: string) { const value = rows.get(id); return value ? structuredClone(value) : null; },
    async getLatest() { return null; },
    async list() { return [...rows.values()]; },
    async delete(id: string) { rows.delete(id); },
    async close() { rows.clear(); },
  };
  return self;
}
function quantile(sorted: number[], q: number) {
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[pos] ?? 0;
}
async function measure(warmEvents: number, sampleClicks: number) {
  const repository = perfRepository();
  const session = new PlaySession({ id: "perf", runtime: makeRuntime(), preset, card: { name: "Perf" }, repository, provider: { async complete() { return { text: "ok" }; } } });
  for (let i = 0; i < warmEvents; i += 1) await session.runLedgerAction("progression/gain", { source: "train" });
  const samples: number[] = [];
  for (let i = 0; i < sampleClicks; i += 1) {
    const started = performance.now();
    await session.runLedgerAction("progression/gain", { source: "train" });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    warmEvents, sampleClicks,
    p50: Number(quantile(samples, 0.5).toFixed(2)),
    p95: Number(quantile(samples, 0.95).toFixed(2)),
    max: Number(quantile(samples, 1).toFixed(2)),
    payloadBytes: repository.lastBytes,
    puts: repository.puts,
  };
}
const small = await measure(50, 100);
const large = await measure(1000, 100);
const report = {
  contract: "click-perf-harness/0.1",
  node: process.version,
  small, large,
  growthFactorP95: Number((large.p95 / Math.max(0.01, small.p95)).toFixed(2)),
  payloadGrowthFactor: Number((large.payloadBytes / Math.max(1, small.payloadBytes)).toFixed(2)),
};
console.log(JSON.stringify(report, null, 2));
