import type { AssetMacroAsset } from "@simbot/risu";

export const GFL_SFW_EMOTIONS = [
  "angry", "aroused", "backview", "crying", "curious", "death", "defeat", "despair",
  "disgust", "drunk", "drunksleep", "empty", "excited", "exhausted", "flustered",
  "hardorgasm", "joy", "love", "motivated", "natural", "pouting", "sad", "scared",
  "serious", "shy", "sleep", "sleepy", "smug", "softorgasm", "surprise", "thinking",
  "worry",
] as const;

type CatalogAsset = Pick<AssetMacroAsset, "name" | "type" | "mime" | "moduleNamespace">;
export interface SpriteRosterEntry { aliases: readonly string[] }
export interface SpriteCatalogWarning { code: "sprite_catalog_truncated"; detail: string }
export interface StructuredSpriteCatalog {
  mode: "structured";
  characters: string[];
  bareCharacters: string[];
  emotions: string[];
  nudeCharacters: string[];
  nudeEmotions: string[];
  omittedCharacterCount: number;
  warnings: SpriteCatalogWarning[];
}
export interface FlatSpriteCatalog {
  mode: "flat";
  commands: string[];
  omittedCharacterCount: number;
  warnings: SpriteCatalogWarning[];
}
export type SpriteCatalog = StructuredSpriteCatalog | FlatSpriteCatalog;

const MAX_GUIDE_CHARACTERS = 600;
const nudePrefix = "nude.";
const knownSuffixes = [
  ...GFL_SFW_EMOTIONS.map((emotion) => `${nudePrefix}${emotion}`),
  ...GFL_SFW_EMOTIONS,
].sort((a, b) => b.length - a.length);

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function uniqueExact(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.normalize("NFKC").toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseGflSpriteName(name: string) {
  for (const emotion of knownSuffixes) {
    const suffix = `_${emotion}`;
    if (name.length > suffix.length && name.toLowerCase().endsWith(suffix.toLowerCase())) {
      return { character: name.slice(0, -suffix.length), emotion };
    }
  }
  return null;
}

function intersection(groups: readonly Set<string>[]) {
  if (!groups.length) return [];
  return [...groups[0]!].filter((value) => groups.slice(1).every((group) => group.has(value)));
}

function warning(total: number, included: number, unit = "명"): SpriteCatalogWarning[] {
  const omitted = total - included;
  return omitted > 0
    ? [{ code: "sprite_catalog_truncated", detail: `전체 ${total}${unit} · 포함 ${included}${unit} · 제외 ${omitted}${unit}` }]
    : [];
}

export function buildSpriteCatalog(
  roster: readonly SpriteRosterEntry[],
  assets: readonly CatalogAsset[],
  options: { allowNsfw?: boolean; flatCommands?: readonly string[]; maxCharacters?: number } = {},
): SpriteCatalog {
  const images = assets.filter((asset) => asset.mime.startsWith("image/"));
  const groups = new Map<string, { name: string; sfw: Set<string>; nude: Set<string>; bare: boolean }>();
  let parsedCount = 0;
  for (const asset of images) {
    const parsed = parseGflSpriteName(asset.name);
    if (!parsed) continue;
    parsedCount += 1;
    const key = normalize(parsed.character);
    if (!key) continue;
    const group = groups.get(key) ?? { name: parsed.character, sfw: new Set<string>(), nude: new Set<string>(), bare: false };
    if (parsed.emotion.startsWith(nudePrefix)) group.nude.add(parsed.emotion);
    else group.sfw.add(parsed.emotion);
    groups.set(key, group);
  }
  for (const asset of images) {
    const group = groups.get(normalize(asset.name));
    if (group && asset.name.normalize("NFKC").toLowerCase() === group.name.normalize("NFKC").toLowerCase()) group.bare = true;
  }

  const distinctSfw = new Set([...groups.values()].flatMap((group) => [...group.sfw]));
  const structured = parsedCount >= 8 && distinctSfw.size >= 4;
  const rosterMatches = uniqueExact(roster.flatMap((entry) => {
    const keys = new Set(entry.aliases.map(normalize).filter(Boolean));
    return [...groups.entries()].filter(([key]) => keys.has(key)).map(([, group]) => group.name);
  })).map((name) => groups.get(normalize(name))!);
  const limit = options.maxCharacters ?? MAX_GUIDE_CHARACTERS;

  if (structured && rosterMatches.length) {
    const eligible = rosterMatches.filter((group) => group.sfw.size > 0);
    const included = eligible.slice(0, limit);
    const nudeEligible = options.allowNsfw ? included.filter((group) => group.nude.size > 0) : [];
    return {
      mode: "structured",
      characters: included.map((group) => group.name),
      bareCharacters: included.filter((group) => group.bare).map((group) => group.name),
      emotions: intersection(included.map((group) => group.sfw)),
      nudeCharacters: nudeEligible.map((group) => group.name),
      nudeEmotions: intersection(nudeEligible.map((group) => group.nude)),
      omittedCharacterCount: Math.max(0, eligible.length - included.length),
      warnings: warning(eligible.length, included.length),
    };
  }

  const aliases = roster.flatMap((entry) => entry.aliases.map(normalize).filter(Boolean));
  const commands = uniqueExact([
    ...(options.flatCommands ?? []),
    ...images.map((asset) => asset.name),
  ]).filter((command) => {
    const value = normalize(command);
    return aliases.some((alias) => value === alias || value.startsWith(alias));
  });
  const included = commands.slice(0, limit);
  return {
    mode: "flat",
    commands: included,
    omittedCharacterCount: Math.max(0, commands.length - included.length),
    warnings: warning(commands.length, included.length, "개"),
  };
}

export function spriteCommandGuide(catalog: SpriteCatalog) {
  if (catalog.mode === "flat") return catalog.commands.length
    ? `[유효 스프라이트 명령]\n${catalog.commands.join(", ")}\n이미지 태그에는 위 이름만 정확히 사용한다. 목록에 없는 캐릭터·표정 이름은 만들지 않는다.`
    : "[유효 스프라이트 명령 없음]\n이미지 태그를 만들지 않는다.";
  if (!catalog.characters.length || !catalog.emotions.length) return "[유효 스프라이트 명령 없음]\n이미지 태그를 만들지 않는다.";
  const lines = [
    "[유효 스프라이트 명령]",
    "명령 이름 형식: 캐릭터_표정 (예: HK416_natural)",
    `캐릭터: ${catalog.characters.join(", ")}`,
    `공통 표정: ${catalog.emotions.join(", ")}`,
  ];
  if (catalog.bareCharacters.length) lines.push(`기본 이미지가 있는 캐릭터(단독 명령 가능): ${catalog.bareCharacters.join(", ")}`);
  if (catalog.nudeCharacters.length && catalog.nudeEmotions.length) {
    lines.push(`성인용 이미지 지원 캐릭터: ${catalog.nudeCharacters.join(", ")}`);
    lines.push(`성인용 공통 표정: ${catalog.nudeEmotions.join(", ")}`);
  }
  lines.push("캐릭터와 표정은 위 목록의 정확한 철자만 조합하고, 출력 표식은 카드 지침의 형식을 따른다. 목록에 없는 이름은 만들지 않는다.");
  return lines.join("\n");
}
