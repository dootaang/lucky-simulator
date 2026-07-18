import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCard } from "@simbot/card";
import { cardToRuntimeProject, classifyPromptMacro, expandPromptMacros, promptMacroName } from "@simbot/risu";

type Location = "lore" | "system" | "regex" | "trigger";
type Hit = { raw: string; name: string; location: Location; path: string; classification: string };
const args = process.argv.slice(2).filter((value) => value !== "--");
const cardPath = resolve(args[0] ?? "../../../소녀전선/업데이트버전/소녀전선_잔불.png");
const parsed = parseCard(new Uint8Array(await readFile(cardPath)), cardPath), root = parsed.card as Record<string, unknown>,
  data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>,
  extensions = (data.extensions && typeof data.extensions === "object" ? data.extensions : {}) as Record<string, unknown>,
  risu = (extensions.risuai && typeof extensions.risuai === "object" ? extensions.risuai : {}) as Record<string, unknown>, hits: Hit[] = [];

function scan(value: unknown, location: Location, path: string) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\{\{\s*([^{}]+?)\s*}}/g)) {
      const raw = match[1]!.trim();
      hits.push({ raw, name: promptMacroName(raw), location, path, classification: classifyPromptMacro(raw) });
    }
  } else if (Array.isArray(value)) value.forEach((entry, index) => scan(entry, location, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => scan(entry, location, `${path}.${key}`));
}

const book = (data.character_book && typeof data.character_book === "object" ? data.character_book : {}) as Record<string, unknown>,
  lore = Array.isArray(book.entries) ? book.entries as Array<Record<string, unknown>> : [];
scan(lore, "lore", "character_book.entries");
for (const key of ["system_prompt", "post_history_instructions", "description", "personality", "scenario"]) scan(data[key], "system", key);
scan(risu.customScripts ?? risu.customscript ?? [], "regex", "extensions.risuai.customScripts");
scan(risu.triggerscript ?? risu.triggerScript ?? [], "trigger", "extensions.risuai.triggerscript");

const byName = new Map<string, { total: number; locations: Record<Location, number>; classification: string }>();
for (const hit of hits) {
  const row = byName.get(hit.name) ?? { total: 0, locations: { lore: 0, system: 0, regex: 0, trigger: 0 }, classification: hit.classification };
  row.total++; row.locations[hit.location]++; byName.set(hit.name, row);
}
const top = [...byName].sort((left, right) => right[1].total - left[1].total).slice(0, 30);

// The historic ×945 diagnostic came from the 40 always-active lore entries: 949 raw tokens minus four native {{user}} tokens.
const constantLore = lore.filter((entry) => entry.constant === true), legacyNative = new Set(["user", "char", "bot", "persona", "raw", "path", "img", "image", "asset", "emotion", "bg", "bgm", "audio", "video", "videoimg"]);
let constantRaw = 0, beforeUnsupported = 0;
for (const entry of constantLore) for (const match of String(entry.content ?? "").matchAll(/\{\{\s*([^{}]+?)\s*}}/g)) {
  constantRaw++;
  if (!legacyNative.has(promptMacroName(match[1]!))) beforeUnsupported++;
}
const profile = cardToRuntimeProject(parsed), after = new Map<string, string>();
for (const entry of constantLore) {
  const result = expandPromptMacros(String(entry.content ?? ""), { user: "User", char: parsed.name, persona: "", variables: profile.defaultVariables });
  for (const warning of result.unsupported) if (!after.has(warning.name)) after.set(warning.name, warning.detail);
}
const afterUnsupported = after.size, reduction = beforeUnsupported ? (beforeUnsupported - afterUnsupported) / beforeUnsupported * 100 : 100;

console.log(`card: ${parsed.name}`);
console.log(`raw macros: ${hits.length} / names: ${byName.size}`);
console.log(`historic constant-lore unsupported: ${beforeUnsupported} (${constantRaw} raw)`);
console.log(`after safe expansion + name dedupe: ${afterUnsupported} / reduction: ${reduction.toFixed(2)}%`);
console.log("\n| macro | total | lore | system | regex | trigger | class |");
console.log("|---|---:|---:|---:|---:|---:|---|");
for (const [name, row] of top) console.log(`| ${name} | ${row.total} | ${row.locations.lore} | ${row.locations.system} | ${row.locations.regex} | ${row.locations.trigger} | ${row.classification} |`);
console.log("\nremaining warnings:");
console.log(JSON.stringify(Object.fromEntries(after), null, 2));
