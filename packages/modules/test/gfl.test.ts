import { describe, expect, it } from "vitest";
import { createRng, createState } from "@simbot/kernel";
import { createCoreRegistry, gflModule } from "../src/index.ts";

const schema = {
  initialState: {
    day: 1,
    gold: 5000,
    resources: { res: 3000, parts: 3, cores: 9 },
    items: {},
    player: {
      pools: { hp: { cur: 1000, max: 1000 }, mp: { cur: 1000, max: 1000 } },
    },
    clock: { day: 1, hour: 8, turn: 0 },
    location: "base-command",
    gfl: {
      started: false,
      baseLocation: "base-command",
      dolls: {},
      echelons: [
        { id: "e1", name: "제1제대", slots: [null, null, null, null, null] },
      ],
      facilities: { base1: 1, base5: 1 },
      hireOffers: [],
      hirePreviousOffers: [],
      hireOfferDay: null,
      hireRefreshDay: null,
      hiredDay: null,
      manufacturing: [],
      repairs: [],
      completedMissions: [],
      sortie: null,
    },
  },
  resources: [
    { id: "res", basePrice: 1 },
    { id: "parts", basePrice: 1 },
    { id: "cores", basePrice: 1 },
  ],
  gather: { small: [1, 1] },
  party: { maxSize: 5, roles: ["slot1"] },
  time: { hoursPerStep: 4 },
  jobs: [],
  locations: [
    { id: "base-hall", name: "복도" },
    { id: "base-command", name: "지휘관실" },
    { id: "base-maintenance", name: "정비실" },
    { id: "base-outside", name: "기지 외부" },
  ],
  combat: {
    d: 20,
    minDamage: 1,
    critMult: 2,
    guardMult: 0.5,
    fleeRate: 50,
    heavyRate: 0,
    heavyMult: 1.5,
    heavyAcc: 0,
    defeatReviveRatio: 0.2,
    expTable: { E: [1, 1] },
    lootGold: { E: [1, 1] },
  },
  skills: {},
  gfl: {
    dolls: [
      {
        id: "m4a1",
        name: "M4A1",
        class: "AR",
        grade: 5,
        maxHp: 1000,
        power: 1000,
        maxMp: 1600,
        mood: 90,
        price: 700,
      },
      {
        id: "ump45",
        name: "UMP45",
        class: "SMG",
        grade: 4,
        maxHp: 900,
        power: 900,
        price: 400,
        description: "404 소대장",
      },
    ],
    items: [{ id: "ration", name: "전투식량", price: 50 }],
    equipment: [
      { id: "scope", name: "옵티컬", price: 100, power: 50, ban: ["SG"] },
    ],
    fairies: [{ id: "command", name: "지휘요정", power: 300 }],
    missions: [
      {
        id: "alpha",
        name: "ALPHA",
        power: 800,
        enemy: "철혈",
        rank: "E",
        rewards: { gold: 500, parts: 1 },
      },
    ],
    facilities: [
      {
        id: "base1",
        name: "훈련 시설",
        maxLevel: 5,
        cost: { gold: 100, res: 50 },
        costMultiplier: 1.5,
      },
      {
        id: "base5",
        name: "인형 숙소",
        maxLevel: 5,
        cost: { gold: 80, res: 40 },
        costMultiplier: 1.5,
      },
    ],
    hire: {
      dailySlots: 5,
      snipePremium: 300,
      capacity: [3, 6, 9, 12, 15],
      arrivalSteps: 1,
    },
    modPower: [111, 222, 333],
    commanderFunds: 10000,
    manufacturing: {
      doll: { gold: 100, res: 100 },
      equipment: { gold: 100, res: 100 },
      heavy: { gold: 500, res: 500 },
    },
  },
};
function runtime(source: any = schema, seed: unknown = 7) {
  const registry = createCoreRegistry().register(gflModule()),
    rng = createRng(seed);
  let state = createState(source, seed);
  return {
    get state() {
      return state;
    },
    dispatch(id: string, params: Record<string, unknown> = {}) {
      const result = registry.dispatch(source, state, { id, params }, rng);
      if (result.log.some((row) => row.ok)) state = result.state;
      return result;
    },
    select(id: string) {
      return registry.select(id, source, state);
    },
    snapshot() {
      return { state: structuredClone(state), rng: rng.snapshot() };
    },
  };
}
describe("Girls Frontline native module", () => {
  it("runs start, echelon, sortie, combat settlement, repair and manufacturing deterministically", () => {
    const game = runtime();
    expect(
      game.dispatch("gfl/start", { mode: "commander" }).log[0],
    ).toMatchObject({ ok: true, starter: null });
    expect(game.select("gfl/dolls")).toEqual([]);
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    expect(
      game.dispatch("gfl/echelon/assign", {
        echelonId: "e1",
        slot: 0,
        dollId: "m4a1",
      }).log[0]?.ok,
    ).toBe(true);
    expect(
      game.dispatch("gfl/sortie/start", { missionId: "alpha", echelonId: "e1" })
        .log[0]?.ok,
    ).toBe(true);
    expect(game.dispatch("gfl/sortie/resolve").log[0]).toMatchObject({
      ok: true,
      outcome: "victory",
      missionId: "alpha",
      llmCallsRequired: 0,
    });
    expect((game.select("combat/console") as any).present).toBe(false);
    expect(game.state.gold).toBeGreaterThan(5000);
    expect(
      game.dispatch("gfl/location/move", { locationId: "base-maintenance" })
        .log[0]?.ok,
    ).toBe(true);
    const manufactured = game.dispatch("gfl/manufacture/start", {
      kind: "doll",
    }).log[0] as any;
    expect(manufactured.ok).toBe(true);
    game.dispatch("gfl/manufacture/tick", { jobId: manufactured.job.id });
    game.dispatch("gfl/manufacture/tick", { jobId: manufactured.job.id });
    expect(
      (game.select("gfl/dolls") as unknown[]).length,
    ).toBeGreaterThanOrEqual(1);
  });
  it("resolves multiple dolls against multiple enemies with doll HP and no generic player HP", () => {
    const source: any = structuredClone(schema);
    source.gfl.missions[0]!.enemies = [
      { id: "jaeger-1", name: "예거 1", power: 350, hp: 300 },
      { id: "jaeger-2", name: "예거 2", power: 350, hp: 300 },
    ];
    const game = runtime(source);
    game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    game.dispatch("gfl/doll/acquire", { dollId: "ump45" });
    game.dispatch("gfl/echelon/assign", {
      echelonId: "e1",
      slot: 0,
      dollId: "m4a1",
    });
    game.dispatch("gfl/echelon/assign", {
      echelonId: "e1",
      slot: 1,
      dollId: "ump45",
    });
    game.dispatch("gfl/sortie/start", {
      missionId: "alpha",
      echelonId: "e1",
    });
    const playerHpBefore = structuredClone((game.state.player as any).pools.hp);
    const battle = game.dispatch("gfl/sortie/resolve").log[0] as any;
    expect(battle).toMatchObject({ ok: true, outcome: "victory" });
    expect(battle.roundCount).toBeLessThanOrEqual(8);
    expect(battle.allies).toHaveLength(2);
    expect(battle.enemies).toHaveLength(2);
    expect(battle.enemies.every((enemy: any) => enemy.hp === 0)).toBe(true);
    expect((game.state.player as any).pools.hp).toEqual(playerHpBefore);
    expect((game.state.gfl as any).sortie).toBeNull();
  });
  it("rejects an empty echelon and insufficient resources without changing state", () => {
    const game = runtime();
    game.dispatch("gfl/start", { mode: "commander" });
    const before = game.snapshot();
    expect(
      game.dispatch("gfl/sortie/start", { missionId: "alpha", echelonId: "e1" })
        .log[0],
    ).toMatchObject({ ok: false, reason: "gfl_echelon_empty" });
    expect(game.snapshot()).toEqual(before);
  });
  it("supports shop equipment and fairy management through engine-owned state", () => {
    const game = runtime();
    game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    expect(
      game.dispatch("gfl/shop/buy", { itemId: "scope" }).log[0],
    ).toMatchObject({ ok: true, price: 100 });
    expect(
      game.dispatch("gfl/equipment/equip", {
        dollId: "m4a1",
        equipmentId: "scope",
      }).log[0],
    ).toMatchObject({ ok: true, power: 1050 });
    expect(
      game.dispatch("gfl/fairy/acquire", { fairyId: "command" }).log[0],
    ).toMatchObject({ ok: true });
    expect(
      game.dispatch("gfl/fairy/assign", { fairyId: "command", echelonId: "e1" })
        .log[0],
    ).toMatchObject({ ok: true });
    expect(game.select("gfl/shop")).toMatchObject({
      catalog: [
        { id: "ration", owned: 0 },
        { id: "scope", owned: 0 },
      ],
      fairies: [{ id: "command", level: 1 }],
    });
  });
  it("preserves daily doll hiring, dorm capacity, arrival delay and snipe pricing", () => {
    const game = runtime();
    game.dispatch("gfl/start", { mode: "commander" });
    expect(game.dispatch("gfl/hire/refresh").log[0]).toMatchObject({
      ok: true,
      daily: true,
      offers: [
        { id: "m4a1", price: 700 },
        { id: "ump45", price: 400 },
      ],
    });
    expect(
      game.dispatch("gfl/hire/contract", { dollId: "ump45" }).log[0],
    ).toMatchObject({ ok: true, cost: 400, arrivalRemaining: 1, capacity: 3 });
    expect(game.select("gfl/hire")).toMatchObject({
      count: 1,
      capacity: 3,
      hiredToday: true,
      arrivals: [{ id: "ump45", status: "이동 중" }],
    });
    expect(
      game.dispatch("gfl/hire/snipe", { dollId: "m4a1" }).log[0],
    ).toMatchObject({ ok: false, reason: "gfl_hire_daily_limit" });
    expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({
      ok: true,
      arrivals: [{ dollId: "ump45", name: "UMP45" }],
    });
    expect(game.select("gfl/dolls")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ump45", status: "대기" }),
      ]),
    );
  });
  it("rerolls a fresh doll slate and avoids yesterday's slate when the pool is large enough", () => {
    const source: any = structuredClone(schema);
    source.gfl.dolls = Array.from({ length: 15 }, (_, index) => ({
      id: `doll-${index}`,
      name: `DOLL-${index}`,
      class: index % 2 ? "AR" : "SMG",
      grade: 3,
      maxHp: 800,
      power: 800,
      price: 500,
    }));
    const game = runtime(source);
    game.dispatch("gfl/start", { mode: "commander" });
    const first = game.dispatch("gfl/hire/refresh").log[0]!.offers as Array<{ id: string }>;
    const second = game.dispatch("gfl/hire/refresh").log[0]!.offers as Array<{ id: string }>;
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(second.every((offer) => !first.some((previous) => previous.id === offer.id))).toBe(true);
    const mutable = game.state as any;
    mutable.day = 2;
    mutable.clock.day = 2;
    mutable.gfl.hireOffers = [];
    mutable.gfl.hireOfferDay = null;
    mutable.gfl.hireRefreshDay = null;
    const nextDay = game.dispatch("gfl/hire/refresh").log[0]!.offers as Array<{ id: string }>;
    expect(nextDay.every((offer) => !second.some((previous) => previous.id === offer.id))).toBe(true);
    const anotherChat = runtime(source, "another-chat");
    anotherChat.dispatch("gfl/start", { mode: "commander" });
    const anotherFirst = anotherChat.dispatch("gfl/hire/refresh").log[0]!.offers as Array<{ id: string }>;
    expect(anotherFirst.map((offer) => offer.id)).not.toEqual(first.map((offer) => offer.id));
  });
  it("uses the card original 1.5x facility cost progression", () => {
    const game = runtime();
    const first = game.dispatch("gfl/facility/upgrade", {
      facilityId: "base1",
    });
    expect(first.log[0]).toMatchObject({
      ok: true,
      cost: { gold: 100, res: 50 },
      nextCost: { gold: 150, res: 75 },
    });
    const second = game.dispatch("gfl/facility/upgrade", {
      facilityId: "base1",
    });
    expect(second.log[0]).toMatchObject({
      ok: true,
      cost: { gold: 150, res: 75 },
      nextCost: { gold: 225, res: 112 },
    });
    expect(game.select("gfl/facilities")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "base1",
          name: "훈련 시설",
          level: 3,
          cost: { gold: 225, res: 112 },
        }),
      ]),
    );
  });
  it("replays 300 native management actions without state drift", () => {
    const left = runtime(),
      right = runtime();
    for (const game of [left, right]) {
      game.dispatch("gfl/start", { mode: "commander" });
      game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    }
    for (let turn = 0; turn < 300; turn++) {
      const id = turn % 2 === 0 ? "gfl/echelon/assign" : "gfl/echelon/remove",
        params =
          turn % 2 === 0
            ? { echelonId: "e1", slot: 0, dollId: "m4a1" }
            : { echelonId: "e1", slot: 0 };
      expect(left.dispatch(id, params).log[0]?.ok).toBe(true);
      expect(right.dispatch(id, params).log[0]?.ok).toBe(true);
    }
    expect(left.snapshot()).toEqual(right.snapshot());
  });
  it("원본 회수값을 쓴다 — 지휘관 시작 자금·MOD_POWER 테이블·인형별 MP/기분", () => {
    const game = runtime();
    game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    expect(game.state.gold).toBe(10000); // commanderFunds (원본 Lua의 지휘관 시작 자금)
    const m4 = (game.select("gfl/dolls") as any[]).find(
      (value) => value.id === "m4a1",
    );
    expect(m4.mp).toEqual({ cur: 1600, max: 1600 });
    expect(m4.mood).toBe(90); // 카드 실능력치 전달
    const before = m4.power as number;
    game.dispatch("gfl/location/move", { locationId: "base-maintenance" });
    expect(
      game.dispatch("gfl/mod/upgrade", { dollId: "m4a1" }).log[0],
    ).toMatchObject({ ok: true, power: before + 111 }); // schema modPower[0]
  });
  it("제조 난수와 저장·복원이 결정론적이다 — 같은 시드는 같은 상태, JSON 왕복 후에도 동일", () => {
    const runs = [runtime(), runtime()].map((game) => {
      game.dispatch("gfl/start", { mode: "commander" });
      game.dispatch("gfl/location/move", { locationId: "base-maintenance" });
      const started = game.dispatch("gfl/manufacture/start", { kind: "doll" })
        .log[0] as any;
      expect(started.ok).toBe(true);
      game.dispatch("gfl/manufacture/tick", { jobId: started.job.id });
      game.dispatch("gfl/manufacture/tick", { jobId: started.job.id });
      game.dispatch("gfl/facility/upgrade", { facilityId: "base1" });
      return game.snapshot();
    });
    expect(runs[0]).toEqual(runs[1]); // 같은 시드·이벤트 → 같은 상태(G2 합의)
    const revived = JSON.parse(JSON.stringify(runs[0]!.state));
    expect(revived).toEqual(runs[0]!.state); // 세이브 직렬화 왕복에 소실 없음
  });
  it("지휘관 위치·정비실 제한·현장/원격 지휘를 원본 규칙대로 구분한다", () => {
    const game = runtime();
    game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    expect(
      game.dispatch("gfl/manufacture/start", { kind: "doll" }).log[0],
    ).toMatchObject({ ok: false, reason: "gfl_maintenance_required" });
    expect(
      game.dispatch("gfl/location/move", { locationId: "base-maintenance" })
        .log[0],
    ).toMatchObject({ ok: true, name: "정비실" });
    expect(game.select("gfl/status")).toMatchObject({
      locationId: "base-maintenance",
      locationName: "정비실",
    });
    game.dispatch("gfl/echelon/assign", {
      echelonId: "e1",
      slot: 0,
      dollId: "m4a1",
    });
    expect(
      game.dispatch("gfl/sortie/start", {
        missionId: "alpha",
        echelonId: "e1",
        command: "field",
      }).log[0],
    ).toMatchObject({ ok: true, command: "field" });
    expect(
      game.dispatch("gfl/location/move", { locationId: "base-command" }).log[0],
    ).toMatchObject({ ok: false, reason: "gfl_commander_in_field" });
    expect(game.select("gfl/locations")).toMatchObject({
      currentId: "base-maintenance",
      locked: true,
    });
    const remote = runtime();
    remote.dispatch("gfl/start", { mode: "commander" });
    remote.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    remote.dispatch("gfl/echelon/assign", {
      echelonId: "e1",
      slot: 0,
      dollId: "m4a1",
    });
    expect(
      remote.dispatch("gfl/sortie/start", {
        missionId: "alpha",
        echelonId: "e1",
        command: "remote",
      }).log[0],
    ).toMatchObject({ ok: true, command: "remote" });
    expect(
      remote.dispatch("gfl/location/move", { locationId: "base-hall" }).log[0]
        ?.ok,
    ).toBe(true);
  });
  it("하루를 여섯 시간대로 넘기며 보급·도착·회복을 한 번만 정산한다", () => {
    const source = structuredClone(schema) as any;
    source.gfl.timePhases = ["오전", "오후", "저녁", "밤", "심야", "새벽"];
    source.gfl.hire.capacity = [4, 8, 12, 16, 20];
    source.initialState.clock.phase = "오전";
    source.initialState.gfl.facilities = { base1: 1, base2: 1, base3: 1, base4: 1, base5: 1 };
    const game = runtime(source);
    game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    const before = Number((game.state.resources as any).res);
    for (let step = 0; step < 3; step++) expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({ ok: true, newDay: false });
    expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({ ok: false, reason: "gfl_night_requires_end_day" });
    expect(game.dispatch("gfl/time/end-day").log[0]).toMatchObject({ ok: true, day: 2, phase: "오전", daily: { income: 300 } });
    expect(Number((game.state.resources as any).res)).toBeGreaterThanOrEqual(before + 300 - 300);
    expect(game.select("gfl/status")).toMatchObject({ day: 2, phase: "오전", time: 8 });
    expect(game.select("gfl/hire")).toMatchObject({ capacity: 4 });
  });
  it("Choice 캡슐을 Dice d20 판정으로 해결하고 AI가 숫자를 주입하지 못하게 한다", () => {
    const game = runtime();game.dispatch("gfl/start", { mode: "commander" });game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "nickname", dc: 1 }).log[0]).toMatchObject({ ok: false, reason: "gfl_check_number_not_allowed" });
    const result = game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "nickname" }).log[0] as any;
    expect(result).toMatchObject({ ok: true, mode: "dc", sides: 20, dc: 10, label: "서로 부를 별명을 정한다" });
    expect(["critical_success", "success", "failure", "critical_failure"]).toContain(result.tier);
    expect(game.select("gfl/status")).toMatchObject({ lastCheck: { roll: result.roll, affinity: result.affinity, mood: result.mood } });
  });
  it("카드 물품 효과·판매와 장비 해제를 실제 인형 상태와 재고에 반영한다", () => {
    const source = structuredClone(schema) as any;source.gfl.items=[{id:"cake",name:"케이크",price:300,type:"use",description:"호감 선물",effect:{hp:50,mood:30,aff:25}}];source.items=source.gfl.items;
    const game=runtime(source);game.dispatch("gfl/start",{mode:"commander"});game.dispatch("gfl/doll/acquire",{dollId:"m4a1"});game.dispatch("gfl/shop/buy",{itemId:"cake"});
    expect(game.dispatch("gfl/item/use",{itemId:"cake",dollId:"m4a1"}).log[0]).toMatchObject({ok:true,effect:{hp:50,mood:30,aff:25},affinity:25});
    game.dispatch("gfl/shop/buy",{itemId:"scope"});game.dispatch("gfl/equipment/equip",{dollId:"m4a1",equipmentId:"scope"});expect(game.dispatch("gfl/equipment/unequip",{dollId:"m4a1",equipmentId:"scope"}).log[0]).toMatchObject({ok:true,power:1000});
  });
  it("요구 전투력 미달도 출격시키고 d20 위험도를 반환한다", () => {
    const source = structuredClone(schema) as any; source.gfl.missions[0].power = 5000;
    const game = runtime(source); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" }); game.dispatch("gfl/echelon/assign", { echelonId: "e1", slot: 0, dollId: "m4a1" });
    expect(game.dispatch("gfl/sortie/start", { missionId: "alpha", echelonId: "e1", engagementMode: "tactical" }).log[0]).toMatchObject({ ok: true, power: 1100, risk: { ratio: 22, label: "극위험" }, sortiesRemaining: 2 });
  });
  it("같은 전선의 작전 지역을 이전 지역 클리어 순서로 개방한다", () => {
    const source = structuredClone(schema) as any; source.gfl.missions[0].theater = "front"; source.gfl.missions.push({ id: "beta", name: "BETA", theater: "front", power: 100, enemy: "철혈", rewards: {} });
    const game = runtime(source); expect(game.select("gfl/missions")).toMatchObject([{ id: "alpha", unlocked: true }, { id: "beta", unlocked: false }]);
    (game.state.gfl as any).completedMissions = ["alpha"]; expect(game.select("gfl/missions")).toMatchObject([{ id: "alpha", unlocked: true }, { id: "beta", unlocked: true }]);
  });
  it("대표 인형·관계 난이도·일일 작전 제한을 엔진 상태로 저장한다", () => {
    const game = runtime(); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" }); game.dispatch("gfl/echelon/assign", { echelonId: "e1", slot: 0, dollId: "m4a1" });
    expect(game.dispatch("gfl/doll/feature", { dollId: "m4a1" }).log[0]).toMatchObject({ ok: true }); expect(game.dispatch("gfl/settings/update", { relationDifficulty: "strict" }).log[0]).toMatchObject({ ok: true });
    expect(game.select("gfl/status")).toMatchObject({ featuredDollId: "m4a1", settings: { relationDifficulty: "strict" } });
    for (let count = 0; count < 3; count++) { game.dispatch("gfl/sortie/start", { missionId: "alpha", echelonId: "e1" }); game.dispatch("gfl/sortie/resolve"); const unit=(game.state.gfl as any).dolls.m4a1; unit.hp.cur=unit.hp.max; }
    expect(game.select("gfl/daily")).toMatchObject({ sortiesUsed: 3, sortiesRemaining: 0, sortieLimit: 3 }); expect(game.dispatch("gfl/sortie/start", { missionId: "alpha", echelonId: "e1" }).log[0]).toMatchObject({ ok: false, reason: "gfl_sortie_daily_limit" });
  });
  it("관계 선택지를 티어·일일 사용량 기반으로 제시하고 잠금 사유를 밝힌다", () => {
    const source = structuredClone(schema) as any;
    source.gfl.relation = { names: ["첫 만남", "신뢰", "친밀", "연인", "가족"], thresholds: [0, 50, 150, 300, 450], descriptions: ["", "서로를 알아간다", "", "", ""] };
    const game = runtime(source); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    const entry = (game.select("gfl/relation/options") as any).dolls.m4a1;
    expect(entry.tier).toMatchObject({ index: 0, label: "첫 만남" });
    const byId = Object.fromEntries(entry.choices.map((choice: any) => [choice.id, choice]));
    expect(byId.talk).toMatchObject({ available: true, dc: 8 });
    expect(byId.nickname).toMatchObject({ available: true });
    expect(byId["ask-past"]).toMatchObject({ available: false, reason: "tier_locked", requiredTierLabel: "신뢰" });
    (game.state.gfl as any).dolls.m4a1.affinity = 60;
    const after = (game.select("gfl/relation/options") as any).dolls.m4a1;
    const afterById = Object.fromEntries(after.choices.map((choice: any) => [choice.id, choice]));
    expect(after.tier.index).toBe(1);
    expect(afterById["ask-past"].available).toBe(true);
    expect(afterById.train).toMatchObject({ available: false, reason: "tier_locked" });
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "train" }).log[0]).toMatchObject({ ok: false, reason: "gfl_relation_tier_locked", detail: "친밀" });
  });
  it("같은 선택지 반복은 효과가 절반이 되고 하루 상한을 넘으면 거부한다", () => {
    const game = runtime(); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    const unit = (game.state.gfl as any).dolls.m4a1; unit.affinity = 490; unit.mood = 1000; // 보정 +19 → 어떤 굴림도 성공
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "talk" }).log[0]).toMatchObject({ ok: true, repeated: false });
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "talk" }).log[0]).toMatchObject({ ok: true, repeated: true });
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "talk" }).log[0]).toMatchObject({ ok: false, reason: "gfl_relation_choice_exhausted" });
    game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "nickname" });
    game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "encourage" });
    expect(game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "nickname" }).log[0]).toMatchObject({ ok: false, reason: "gfl_relation_exhausted" });
    expect((game.select("gfl/relation/options") as any).dolls.m4a1.remaining).toBe(0);
  });
  it("성공한 판정은 후속 캡슐을 남기고 소비하면 DC 보정이 적용된다", () => {
    const game = runtime(); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    const unit = (game.state.gfl as any).dolls.m4a1; unit.affinity = 490; unit.mood = 1000;
    const first = game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "talk" }).log[0] as any;
    expect(first.followUps.length).toBeGreaterThan(0);
    const followUp = (game.select("gfl/status") as any).followUp;
    expect(followUp).toMatchObject({ dollId: "m4a1", source: "talk" });
    const offered = followUp.options[0];
    expect(offered.dc).toBeLessThan(10); // nickname 기본 DC 10에서 보정
    const second = game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: offered.choice, followup: true }).log[0] as any;
    expect(second).toMatchObject({ ok: true, dc: offered.dc, followUpBonus: offered.dcMod });
    game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "coffee" });
    expect((game.select("gfl/status") as any).followUp).not.toBeNull();
    expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({ ok: true });
    expect((game.select("gfl/status") as any).followUp).toBeNull(); // 시간대가 넘어가면 캡슐 소멸
  });
  it("판정으로 관계 단계가 오르면 tierChanged를 남긴다", () => {
    const source = structuredClone(schema) as any;
    source.gfl.relation = { names: ["첫 만남", "신뢰"], thresholds: [0, 50], descriptions: ["", "서로를 믿는다"] };
    const game = runtime(source); game.dispatch("gfl/start", { mode: "commander" }); game.dispatch("gfl/doll/acquire", { dollId: "m4a1" });
    const unit = (game.state.gfl as any).dolls.m4a1; unit.affinity = 49; unit.mood = 1000; // 항상 성공, +3 이상이면 승급
    const result = game.dispatch("gfl/relation/check", { dollId: "m4a1", choice: "talk" }).log[0] as any;
    expect(result.tierChanged).toMatchObject({ from: { index: 0 }, to: { index: 1, label: "신뢰", description: "서로를 믿는다" } });
    expect((game.select("gfl/status") as any).lastCheck.tierChanged.to.label).toBe("신뢰");
  });
  it("1:1 대화 세션은 시간을 잠그고 마무리 보너스를 하루 1회 확정한다", () => {
    const game = runtime(); game.dispatch("gfl/start", { mode: "commander" });
    game.dispatch("gfl/doll/acquire", { dollId: "m4a1" }); game.dispatch("gfl/doll/acquire", { dollId: "ump45" });
    expect(game.dispatch("gfl/relation/session/end").log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_missing" });
    expect(game.dispatch("gfl/relation/session/start", { dollId: "m4a1" }).log[0]).toMatchObject({ ok: true, name: "M4A1" });
    expect((game.select("gfl/status") as any).dialogue).toMatchObject({ dollId: "m4a1" });
    expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_active" });
    expect(game.dispatch("gfl/location/move", { locationId: "base-hall" }).log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_active" });
    expect(game.dispatch("gfl/relation/session/start", { dollId: "ump45" }).log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_active" });
    expect(game.dispatch("gfl/relation/check", { dollId: "ump45", choice: "talk" }).log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_other_doll" });
    const before = Number((game.state.gfl as any).dolls.m4a1.affinity);
    expect(game.dispatch("gfl/relation/session/end").log[0]).toMatchObject({ ok: true, affinityDelta: 2, moodDelta: 10 });
    expect(Number((game.state.gfl as any).dolls.m4a1.affinity)).toBe(before + 2);
    expect(game.dispatch("gfl/relation/session/start", { dollId: "m4a1" }).log[0]).toMatchObject({ ok: false, reason: "gfl_dialogue_daily_limit" });
    expect((game.select("gfl/relation/options") as any).dolls.m4a1.dialogueUsed).toBe(true);
    expect(game.dispatch("gfl/relation/session/start", { dollId: "ump45" }).log[0]).toMatchObject({ ok: true });
    expect(game.dispatch("gfl/relation/session/end").log[0]).toMatchObject({ ok: true });
    expect(game.dispatch("gfl/time/advance").log[0]).toMatchObject({ ok: true });
  });
});
