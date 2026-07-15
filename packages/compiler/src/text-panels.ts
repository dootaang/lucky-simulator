export interface TextPanelDecl {
  id: string;
  kind: 'panel' | 'feed';
  fields: string[];
  source: string;
}

export interface TextPanelRegexScript {
  in: string;
  type: string;
  comment?: string;
}

const CAPTURE_MARKERS = [String.raw`\s*([^|]+?)\s*\|`, String.raw`\s*([^\|]+?)\s*\|`];
const DISPLAY_TYPES = new Set(['editdisplay', 'edit_display', 'display', 'editoutput', 'edit_output', 'output']);

interface FieldCapture { label: string; labelStart: number; end: number; }

function literalLabel(prefix: string): { label: string; start: number } | null {
  const match = /((?:[\p{L}\p{N}\p{M}_./·-]|\\[/.()[\]{}+*?^$-])(?:[\p{L}\p{N}\p{M} _./·-]|\\[/.()[\]{}+*?^$-])*)\s*:\s*$/u.exec(prefix);
  if (!match || match.index == null) return null;
  const raw = match[1]!.trim();
  const label = raw.replace(/\\([/.()[\]{}+*?^$-])/g, '$1');
  return label ? { label, start: match.index + match[0].indexOf(match[1]!) } : null;
}

function captures(pattern: string): FieldCapture[] {
  const output: FieldCapture[] = [];
  let cursor = 0;
  while (cursor < pattern.length) {
    let at = -1, marker = '';
    for (const candidate of CAPTURE_MARKERS) {
      const found = pattern.indexOf(candidate, cursor);
      if (found >= 0 && (at < 0 || found < at)) { at = found; marker = candidate; }
    }
    if (at < 0) break;
    const parsed = literalLabel(pattern.slice(0, at));
    if (parsed) output.push({ label:parsed.label, labelStart:parsed.start, end:at + marker.length });
    cursor = at + marker.length;
  }
  return output;
}

function consecutive(left: FieldCapture, right: FieldCapture, pattern: string): boolean {
  return /^(?:(?:\\[srnt]\*?)|\s)*$/.test(pattern.slice(left.end, right.labelStart));
}

function feedPrefix(pattern: string, capture: FieldCapture): boolean {
  return /\\\|(?:(?:\\[srnt]\*?)|\s)*$/.test(pattern.slice(0, capture.labelStart));
}

function slug(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Structurally extracts declared text field chains from display/output regex input patterns. */
export function extractTextPanels(regexScripts: readonly TextPanelRegexScript[]): TextPanelDecl[] {
  const candidates: Array<Omit<TextPanelDecl, 'id'> & {idBase:string}> = [];
  for (const [scriptIndex, script] of regexScripts.entries()) {
    if (!DISPLAY_TYPES.has(String(script.type || '').toLowerCase())) continue;
    const pattern = String(script.in ?? ''), found = captures(pattern);
    let index = 0;
    while (index < found.length) {
      const chain = [found[index]!];
      while (found[index + 1] && consecutive(found[index]!, found[index + 1]!, pattern)) chain.push(found[++index]!);
      const comment=script.comment?.trim()??'',source=comment||`regex[${scriptIndex}]`,idBase=slug(comment);
      if (chain.length >= 2) candidates.push({kind:'panel', fields:chain.map(item=>item.label), source,idBase});
      else if (feedPrefix(pattern, chain[0]!)) candidates.push({kind:'feed', fields:[chain[0]!.label], source,idBase});
      index += 1;
    }
  }
  const used = new Set<string>();
  return candidates.map((candidate, index) => {
    const {idBase,...declaration}=candidate,base=idBase || `panel-${index + 1}`;
    let id = base, suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return {id, ...declaration};
  });
}
