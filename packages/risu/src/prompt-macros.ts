// Prompt CBS compatibility contract v0.2.
// This layer is deliberately read-only: it expands deterministic lookups and comparisons, never setvar/storage/random/chat mutation.
export type PromptMacroClass = "safe" | "eliminate" | "warn" | "native";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]/g, "");
export function promptMacroName(value: string) {
  const trimmed = value.trim();
  if (/^\/(?:if)?$/i.test(trimmed)) return trimmed.toLowerCase();
  const source = trimmed.replace(/^#/, "");
  return normalize(source.split(/::|:|\s+/)[0] ?? source) || "unknown";
}
export function classifyPromptMacro(value: string): PromptMacroClass {
  if (/^\s*(?:\/(?:if)?|:else)\s*$/i.test(value) || /^\s*#if(?:_pure)?\b/i.test(value)) return "safe";
  const name = promptMacroName(value);
  if (["user", "char", "bot", "persona", "original", "slot", "emotionlist", "assetlist", "moduleassetlist", "moduleenabled", "raw", "path", "img", "image", "asset", "emotion", "bg", "bgm", "audio", "video", "videoimg"].includes(name)) return "native";
  if (["getvar", "getglobalvar", "arrayelement", "equal", "is", "notequal", "isnot", "greater", "greaterequal", "less", "lessequal", "calc", "br", "newline", "if", "ifpure"].includes(name) || value.trimStart().startsWith("?")) return "safe";
  return "warn";
}

const truthy = (value: unknown) => !["", "0", "-1", "false", "null", "undefined"].includes(String(value ?? "").trim().toLowerCase());
const blockTruthy = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return truthy(parts[0]);
};
const compare = (a: string, b: string) => {
  const left = Number(a), right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) ? left - right : a.localeCompare(b);
};
const arithmetic = (source: string): string => {
  // calcString is numeric-only; rejecting all other characters keeps this deterministic and non-evaluating.
  if (!/^[\d\s.+*/%<>=!()\-]+$/.test(source)) return "0";
  const comparison = /^(.*?)(==|!=|>=|<=|=|>|<)(.*)$/.exec(source);
  if (comparison) {
    const left: string = arithmetic(comparison[1]!), right: string = arithmetic(comparison[3]!), op = comparison[2]!;
    const delta: number = Number(left) - Number(right);
    return String(Number(op === "==" || op === "=" ? delta === 0 : op === "!=" ? delta !== 0 : op === ">=" ? delta >= 0 : op === "<=" ? delta <= 0 : op === ">" ? delta > 0 : delta < 0));
  }
  const tokens = source.match(/\d+(?:\.\d+)?|[()+*/%\-]/g) ?? [];
  if (tokens.join("").replace(/\s/g, "") !== source.replace(/\s/g, "")) return "0";
  // Shunting-yard evaluator: no JavaScript eval and no identifiers/functions.
  const values: number[] = [], ops: string[] = [], precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  const apply = () => { const op = ops.pop()!, b = values.pop() ?? 0, a = values.pop() ?? 0; values.push(op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? (b === 0 ? 0 : a / b) : (b === 0 ? 0 : a % b)); };
  for (const token of tokens) {
    if (/^\d/.test(token)) values.push(Number(token));
    else if (token === "(") ops.push(token);
    else if (token === ")") { while (ops.length && ops.at(-1) !== "(") apply(); if (ops.at(-1) === "(") ops.pop(); }
    else { while (ops.length && ops.at(-1) !== "(" && (precedence[ops.at(-1)!] ?? 0) >= (precedence[token] ?? 0)) apply(); ops.push(token); }
  }
  while (ops.length) apply();
  const result = values.at(-1) ?? 0;
  return Number.isFinite(result) ? String(result) : "0";
};

export interface PromptMacroContext { user: string; char: string; persona: string; variables: Record<string, string> }
export interface PromptMacroResult { content: string; unsupported: Array<{ name: string; detail: string }>; eliminated: Record<string, number> }

function safeToken(inner: string, context: PromptMacroContext): string | null {
  const source = inner.trim();
  if (Object.prototype.hasOwnProperty.call(context.variables, source)) return context.variables[source] ?? "";
  if (source.startsWith("?")) return arithmetic(source.replace(/^\?\s*/, ""));
  const parts = source.includes("::") ? source.split("::") : source.split(":"), name = normalize(parts.shift() ?? ""), args = parts;
  switch (name) {
    case "user": return context.user;
    case "char": case "bot": return context.char;
    case "persona": return context.persona;
    case "getvar": case "getglobalvar": return context.variables[args[0]?.trim() ?? ""] ?? "";
    case "arrayelement": {
      try {
        const values = JSON.parse(args[0] ?? "[]");
        return Array.isArray(values) ? String(values[Math.trunc(Number(args[1] ?? 0))] ?? "") : "";
      } catch { return ""; }
    }
    case "equal": case "is": return String(Number(String(args[0] ?? "") === String(args[1] ?? "")));
    case "notequal": case "isnot": return String(Number(String(args[0] ?? "") !== String(args[1] ?? "")));
    case "greater": return String(Number(compare(args[0] ?? "", args[1] ?? "") > 0));
    case "greaterequal": return String(Number(compare(args[0] ?? "", args[1] ?? "") >= 0));
    case "less": return String(Number(compare(args[0] ?? "", args[1] ?? "") < 0));
    case "lessequal": return String(Number(compare(args[0] ?? "", args[1] ?? "") <= 0));
    case "calc": return arithmetic(args.join("::"));
    case "br": case "newline": return "\n";
    default: return null;
  }
}

function conditionalBlocks(source: string) {
  let text = source, guard = 0;
  while (guard++ < 5000) {
    const open = /\{\{#if(?:_pure)?(?:\s+|::)([^{}]*)}}/i.exec(text);
    if (!open) break;
    let depth = 1, closeStart = -1, closeEnd = -1, elseStart = -1, elseEnd = -1;
    const scan = /\{\{(#if(?:_pure)?(?:\s+|::)[^{}]*|:else|\/(?:if)?)}}/gi;
    scan.lastIndex = open.index + open[0].length;
    let item: RegExpExecArray | null;
    while ((item = scan.exec(text))) {
      if (/^#if/i.test(item[1]!)) depth++;
      else if (item[1]!.toLowerCase() === ":else" && depth === 1) { elseStart = item.index; elseEnd = item.index + item[0].length; }
      else if (--depth === 0) { closeStart = item.index; closeEnd = item.index + item[0].length; break; }
    }
    if (closeStart < 0) break;
    const yes = text.slice(open.index + open[0].length, elseStart < 0 ? closeStart : elseStart), no = elseStart < 0 ? "" : text.slice(elseEnd, closeStart);
    text = text.slice(0, open.index) + (blockTruthy(open[1] ?? "") ? yes : no) + text.slice(closeEnd);
  }
  return text;
}

export function expandPromptMacros(source: string, context: PromptMacroContext): PromptMacroResult {
  let content = String(source ?? ""), guard = 0;
  // Resolve innermost read-only tokens first so their values can feed an outer comparison/if.
  while (guard++ < 10_000) {
    let changed = false;
    const next = content.replace(/\{\{(?!\s*[#:/])([^{}]*?)}}/g, (whole, inner: string) => {
      const value = safeToken(inner, context);
      if (value === null) return whole;
      changed = true;
      return value;
    });
    content = next;
    if (!changed) break;
  }
  content = conditionalBlocks(content);
  const unsupported: PromptMacroResult["unsupported"] = [], seen = new Set<string>();
  for (const match of content.matchAll(/\{\{\s*([^{}]+?)\s*}}/g)) {
    const detail = match[1]!.trim();
    if (detail === "original" || detail === "slot") continue;
    const name = promptMacroName(detail);
    if (!seen.has(name)) { seen.add(name); unsupported.push({ name, detail }); }
  }
  return { content, unsupported, eliminated: {} };
}
