import { describe, expect, it } from "vitest";
import { buildSpriteCatalog, parseGflSpriteName, spriteCommandGuide } from "../src/sprite-catalog.ts";

const image = (name: string) => ({ name, type: "module-asset", mime: "image/webp", moduleNamespace: "gfl" });
const emotions = ["natural", "joy", "surprise", "worry", "angry", "thinking", "sad", "crying"];
const roster = (names: string[]) => names.map((name) => ({ aliases: [name] }));

describe("GFL sprite catalog", () => {
  it("parses emotion suffixes from the right without damaging character names", () => {
    expect(parseGflSpriteName("Desert_Eagle_natural")).toEqual({ character: "Desert_Eagle", emotion: "natural" });
    expect(parseGflSpriteName("AK-12_surprise")).toEqual({ character: "AK-12", emotion: "surprise" });
    expect(parseGflSpriteName("9A-91_nude.worry")).toEqual({ character: "9A-91", emotion: "nude.worry" });
    expect(parseGflSpriteName("PP-19-01_natural")).toEqual({ character: "PP-19-01", emotion: "natural" });
  });

  it("keeps every roster character in a 300-character module and follows roster order", () => {
    const names = Array.from({ length: 300 }, (_, index) => index === 299 ? "AK-12" : `Doll_${index}`);
    const assets = [...names].reverse().flatMap((name) => emotions.map((emotion) => image(`${name}_${emotion}`)));
    const catalog = buildSpriteCatalog(roster(names), assets);
    expect(catalog.mode).toBe("structured");
    if (catalog.mode !== "structured") return;
    expect(catalog.characters).toHaveLength(300);
    expect(catalog.characters[0]).toBe("Doll_0");
    expect(catalog.characters.at(-1)).toBe("AK-12");
    expect(catalog.omittedCharacterCount).toBe(0);
  });

  it("uses only emotions shared by all characters and only permits real bare images", () => {
    const assets = [
      ...emotions.map((emotion) => image(`HK416_${emotion}`)), image("HK416"),
      ...emotions.filter((emotion) => emotion !== "surprise").map((emotion) => image(`Lewis_${emotion}`)),
    ];
    const catalog = buildSpriteCatalog(roster(["HK416", "Lewis"]), assets);
    expect(catalog.mode).toBe("structured");
    if (catalog.mode !== "structured") return;
    expect(catalog.emotions).not.toContain("surprise");
    expect(catalog.bareCharacters).toEqual(["HK416"]);
    expect(spriteCommandGuide(catalog)).not.toContain("Lewis_surprise");
  });

  it("hides nude commands by default and limits enabled nude commands to capable characters", () => {
    const assets = [
      ...emotions.map((emotion) => image(`HK416_${emotion}`)),
      ...emotions.map((emotion) => image(`Lewis_${emotion}`)),
      ...emotions.map((emotion) => image(`HK416_nude.${emotion}`)),
    ];
    const disabled = buildSpriteCatalog(roster(["HK416", "Lewis"]), assets);
    const enabled = buildSpriteCatalog(roster(["HK416", "Lewis"]), assets, { allowNsfw: true });
    expect(disabled.mode === "structured" && disabled.nudeCharacters).toEqual([]);
    expect(enabled.mode === "structured" && enabled.nudeCharacters).toEqual(["HK416"]);
    expect(enabled.mode === "structured" && enabled.nudeEmotions).toContain("nude.natural");
  });

  it("reports explicit counts instead of silently truncating", () => {
    const names = ["A", "B", "C"];
    const catalog = buildSpriteCatalog(roster(names), names.flatMap((name) => emotions.map((emotion) => image(`${name}_${emotion}`))), { maxCharacters: 2 });
    expect(catalog.warnings).toEqual([{ code: "sprite_catalog_truncated", detail: "전체 3명 · 포함 2명 · 제외 1명" }]);
  });

  it("keeps small non-structured cards on the exact flat command fallback", () => {
    const catalog = buildSpriteCatalog(roster(["AK-12"]), [image("AK-12_default")], { flatCommands: ["AK-12_default"] });
    expect(catalog).toMatchObject({ mode: "flat", commands: ["AK-12_default"] });
  });
});
