import { describe, expect, it } from "vitest";
import type { ParsedCard } from "@simbot/card";
import { compileKnownCard } from "../src/known-cards.ts";

const DV =
  'A_day=1\nA_gold=5000\nA_res=3000\nD1a=["1500","1600","1250","-5","90","성격 설명"]\nD1d=["7000","계약 설명"]';
function gfl(): ParsedCard {
  const classes = Array.from(
      { length: 20 },
      (_, i) => `["D${i + 1}"]="${i === 0 ? "MG3" : i === 1 ? "??" : "AR"}"`,
    ).join(","),
    grades = Array.from({ length: 20 }, (_, i) => `["D${i + 1}"]=3`).join(","),
    lua = `local DOLL_CLASS={${classes}}\nlocal DOLL_GRADE={${grades}}\nlocal MOD_POWER={[1]=111,[2]=222,[3]=333}\nlocal base_defaults={base1={gold="4000",res="2000"},base2={gold="4000",res="2000"},base3={gold="4000",res="2000"},base4={gold="5000",res="3000"},base5={gold="3000",res="1000"}}\nlocal ITEM_DATA={["RAM"]={price=100,type="use",desc="회복",drop=4},["AUTO"]={price=500,type="use",desc="자동"}}\nlocal EQUIP_DATA={["SCOPE"]={price=200,power=10}}\nlocal PROG_BY_STAR={[0]=3,[1]=5,[2]=7,[3]=8,[4]=9,[5]=10,[6]=11}\nlocal MISSION_TYPES={{key="recon",name="🔍 정찰 임무",step_mod=-1,hint="교전 최소화. 빠르게 끝나지만 보상 적음."},{key="sweep",name="⚔️ 소탕 임무",step_mod=0,hint="구역의 적을 소탕. 표준 난이도·보상."},{key="annihil",name="💥 섬멸 임무",step_mod=1,hint="거점 완전 섬멸. 길고 어렵지만 보상 큼."}}\nlocal EV_GUIDE={battle="교전 지시",boss="보스 지시",recon="정찰 지시",other="돌발 지시",mystery="미확인 지시"}\nlocal MISSION_DATA={["ALPHA"]={name="ALPHA",diff="★★★★☆",power="800",reward="자금 +500 / 부품 +100",enemy="철혈 / 감염체 / 패러데우스",boss=" Scarecrow "},["BETA"]={name="BETA",diff="☆☆☆☆☆",power="900",boss=" "},["GAMMA"]={name="GAMMA",power="1000"}}\n${"-- filler\n".repeat(1200)}`;
  return {
    format: "png",
    source: "gfl.png",
    spec: "chara_card_v3",
    specVersion: "3",
    name: "소녀전선:잔불",
    card: {
      spec: "chara_card_v3",
      data: {
        name: "소녀전선:잔불",
        description: "전술인형과 제대",
        character_book: { entries: [] },
        extensions: {
          risuai: {
            defaultVariables: DV,
            triggerscript: [{ effect: [{ type: "triggerlua", code: lua }] }],
          },
        },
      },
    },
    assets: [],
    containerEntries: [],
    sourceBytes: new Uint8Array([1]),
    modules: [
      {
        name: "runtime",
        origin: "card-extension",
        regex: [],
        lorebook: [],
        defaultVariables: DV,
        raw: {
          triggerscript: [{ effect: [{ type: "triggerlua", code: lua }] }],
        },
      },
    ],
  };
}
describe("known card compiler", () => {
  it("converts the certified GFL structure without an LLM call", () => {
    const result = compileKnownCard(gfl());
    expect(result?.moduleIds).toEqual(["genre.gfl"]);
    expect(result?.screens).toEqual([
      {
        id: "gfl-command",
        title: "그리폰 지휘부",
        layout: "gfl-command",
        regions: { main: [{ widget: "gfl-console" }] },
      },
    ]);
    expect((result?.schema.gfl as any).dolls).toHaveLength(20);
    expect((result?.schema.initialState as any).gfl.echelons.every((entry:any)=>entry.slots.length===6)).toBe(true);
    expect((result?.schema.gfl as any).dolls.slice(0,2).map((unit:any)=>unit.class)).toEqual(["MG","??"]);
    expect((result?.schema.gfl as any).missions[0]).toMatchObject({factions:["철혈","E.L.I.D","패러데우스"],boss:"Scarecrow"});
    expect((result?.schema.gfl as any).missions.map((mission:any)=>mission.stars)).toEqual([4,0,0]);
    expect((result?.schema.gfl as any).missions[1]).not.toHaveProperty("boss");
    expect((result?.schema.gfl as any).progression).toEqual({
      byStar: { 0: 3, 1: 5, 2: 7, 3: 8, 4: 9, 5: 10, 6: 11 },
      missionTypes: [
        { key: "recon", name: "🔍 정찰 임무", stepMod: -1, hint: "교전 최소화. 빠르게 끝나지만 보상 적음." },
        { key: "sweep", name: "⚔️ 소탕 임무", stepMod: 0, hint: "구역의 적을 소탕. 표준 난이도·보상." },
        { key: "annihil", name: "💥 섬멸 임무", stepMod: 1, hint: "거점 완전 섬멸. 길고 어렵지만 보상 큼." },
      ],
      eventGuides: { battle: "교전 지시", boss: "보스 지시", recon: "정찰 지시", other: "돌발 지시", mystery: "미확인 지시" },
    });
    expect((result?.schema.gfl as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "RAM", drop: 4 }),
      expect.objectContaining({ name: "AUTO", drop: 60 }),
    ]));
    expect(result?.issues.map(issue=>issue.message).join(" ")).toContain("병과 오타 정규화(MG3→MG)");
    expect(result?.issues.map(issue=>issue.message).join(" ")).toContain("미지 병과 ??");
    expect((result?.schema.initialState as any).gold).toBe(5000);
    expect(result?.attempts).toEqual([]);
  });
  it("does not claim unrelated cards", () => {
    const value = gfl();
    value.card = { data: { name: "일반 대화" } };
    value.modules = [];
    expect(compileKnownCard(value)).toBeNull();
  });
  it("수치를 발명하지 않는다 — 카드 defaultVariables의 실능력치를 회수하고 없는 인형만 원본 폴백을 쓴다", () => {
    const result = compileKnownCard(gfl()),
      dolls = (result?.schema.gfl as any).dolls;
    expect(dolls[0]).toMatchObject({
      name: "D1",
      maxHp: 1500,
      maxMp: 1600,
      power: 1250,
      mood: 90,
      price: 7000,
      description: "계약 설명",
    }); // 카드 실값
    expect(dolls[1]).toMatchObject({
      name: "D2",
      maxHp: 1000,
      maxMp: 1000,
      power: 500,
      mood: 50,
    }); // 원본 Lua 폴백(발명 공식 아님)
    expect((result?.schema.gfl as any).modPower).toEqual([111, 222, 333]); // MOD_POWER 테이블 회수
    expect((result?.schema.gfl as any).commanderFunds).toBe(10_000); // 지휘관 시작 자금(원본 Lua)
    expect((result?.schema.gfl as any).hire).toMatchObject({
      dailySlots: 5,
      snipePremium: 3000,
      capacity: [4, 8, 12, 16, 20],
    });
    expect((result?.schema.gfl as any).facilities[0]).toMatchObject({
      name: "훈련 시설",
      cost: { gold: 4000, res: 2000 },
      costMultiplier: 1.5,
    });
  });
  it("회수와 합성을 구분해 정직하게 표시한다(헌법 2)", () => {
    const result = compileKnownCard(gfl());
    expect(result?.warnings.join(" ")).toContain("1/20"); // 회수 요약
    const templateIssues =
      result?.issues.filter((issue) => issue.source === "template") ?? [];
    expect(templateIssues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["gfl.dolls", "combat", "gfl.manufacturing"]),
    );
    expect(
      templateIssues.find((issue) => issue.path === "gfl.dolls")?.message,
    ).toContain("19/20");
  });
});
