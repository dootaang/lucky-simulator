import { describe, expect, it } from "vitest";
import { compilePrompt, defaultCardPreset, expandPromptMacros } from "../src/index.ts";

const context = { user: "지휘관", char: "M4A1", persona: "현장 지휘관", variables: { A_day: "7", A_time: "심야", toggle_GFNSFW: "1", direct: "직접값", doll_set: '["M4A1","AR"]' } };

describe("prompt CBS read-only subset v0.2", () => {
  const golden: Array<[string, string]> = [
    ["{{getvar::A_day}}", "7"], ["{{getglobalvar::toggle_GFNSFW}}", "1"], ["{{direct}}", "직접값"], ["{{array_element::{{getvar::doll_set}}::1}}", "AR"],
    ["{{equal::A::A}}", "1"], ["{{is::A::B}}", "0"], ["{{not_equal::A::B}}", "1"], ["{{isnot::A::A}}", "0"],
    ["{{greater::9::2}}", "1"], ["{{greaterequal::2::2}}", "1"], ["{{less::2::9}}", "1"], ["{{lessequal::2::2}}", "1"],
    ["{{calc::2+3*4}}", "14"], ["{{? 7>=3}}", "1"], ["{{? {{getglobalvar::toggle_GFNSFW}}=1}}", "1"], ["A{{br}}B{{newline}}C", "A\nB\nC"],
    ["{{#if 1}}예{{:else}}아니오{{/if}}", "예"], ["{{#if_pure 0}}예{{:else}}아니오{{/}}", "아니오"],
    ["{{#if_pure {{not_equal::{{getvar::A_time}}::오전}}}}야간{{/}}", "야간"],
    ["{{#if_pure {{not_equal::오전::오전}} 1}}오류{{:else}}정상{{/}}", "정상"],
  ];
  for (const [source, expected] of golden) it(`${source} → ${JSON.stringify(expected)}`, () => {
    expect(expandPromptMacros(source, context)).toEqual({ content: expected, unsupported: [], eliminated: {} });
  });

  it("상태 쓰기·소스·랜덤 매크로는 실행하지 않고 이름별 경고 하나로 보존한다", () => {
    const source = "{{setvar::A_day::99}} / {{setvar::A_time::새벽}} / {{source::user}} / {{random::1::20}}";
    const result = expandPromptMacros(source, context);
    expect(result.content).toBe(source);
    expect(result.unsupported).toEqual([
      { name: "setvar", detail: "setvar::A_day::99" },
      { name: "source", detail: "source::user" },
      { name: "random", detail: "random::1::20" },
    ]);
    expect(context.variables).toEqual({ A_day: "7", A_time: "심야", toggle_GFNSFW: "1", direct: "직접값", doll_set: '["M4A1","AR"]' });
  });

  it("프롬프트 전체에서도 같은 미지원 이름은 한 번만 경고한다", () => {
    const preset = defaultCardPreset(), result = compilePrompt({ preset, card: { name: "GFL", description: "{{setvar::x::1}}", scenario: "{{setvar::y::2}}" } });
    expect(result.warnings.filter((warning) => warning.code === "unsupported_macro")).toEqual([{ code: "unsupported_macro", path: "card.description", detail: "setvar::x::1" }]);
    expect(result.messages.map((message) => message.content).join("\n")).toContain("{{setvar::y::2}}");
  });

  it("용사여관·Alternate Hunters 비매크로 프롬프트 바이트를 그대로 보존한다", () => {
    const inn = compilePrompt({ preset: defaultCardPreset(), card: { name: "용사여관", description: "객실 숙박과 체크인 체크아웃을 운영한다.", systemPrompt: "규칙을 지키며 여관을 운영한다." } });
    const hunter = compilePrompt({ preset: defaultCardPreset(), card: { name: "Alternate Hunters V2", description: "헌터 협회의 의뢰를 수행한다.", systemPrompt: "설정 원문을 따른다." } });
    expect(new TextEncoder().encode(inn.messages.map((message) => message.content).join("\n"))).toEqual(new TextEncoder().encode("규칙을 지키며 여관을 운영한다.\n객실 숙박과 체크인 체크아웃을 운영한다."));
    expect(new TextEncoder().encode(hunter.messages.map((message) => message.content).join("\n"))).toEqual(new TextEncoder().encode("설정 원문을 따른다.\n헌터 협회의 의뢰를 수행한다."));
  });
});
