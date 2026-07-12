export type RuntimeObject = Record<string, unknown>;

export interface SpeakerGroup {
  charId?: unknown;
  profile?: { name?: unknown } | null;
  emotions?: Map<unknown, unknown>;
}

export interface ResolveSpeakerOptions {
  groups?: readonly SpeakerGroup[];
  requestedEmotion?: unknown;
  preferEmotion?: (group: SpeakerGroup) => unknown;
  pickAsset?: (group: SpeakerGroup, emotion: string, outfit?: number) => { asset?: unknown } | null;
}

export interface ResolvedSpeaker {
  id: string;
  name: string;
  outfit?: number;
  emotion?: string;
  npc?: RuntimeObject;
  group?: SpeakerGroup;
  asset?: unknown;
}

export interface SpeakerReference { npcId?: unknown; emotion?: unknown; focus?: boolean; }
export interface ResolvedSpeakerEntry { npcId: string; name: string; emotion?: string; outfit?: number; focus: boolean; }

export function normalized(value: unknown): string {
  return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase();
}

function npcEntities(schema: unknown): RuntimeObject[] {
  if (!schema || typeof schema !== 'object') return [];
  const entities = (schema as RuntimeObject).entities;
  if (!Array.isArray(entities)) return [];
  const block = entities.find((entry) => entry && typeof entry === 'object' && (entry as RuntimeObject).type === 'npc') as RuntimeObject | undefined;
  return Array.isArray(block?.instances) ? block.instances.filter((entry): entry is RuntimeObject => Boolean(entry) && typeof entry === 'object') : [];
}

export function aliasesOf(npc: RuntimeObject | null | undefined): unknown[] {
  if (!npc) return [];
  const aliases = Array.isArray(npc.aliases) ? npc.aliases : [];
  return [npc.id, npc.name, npc.nameKo, npc.nameEn, ...aliases].filter(Boolean);
}

export function findNpc(schema: unknown, reference: unknown): RuntimeObject | null {
  const key = normalized(reference);
  if (!key) return null;
  return npcEntities(schema).find((npc) => aliasesOf(npc).some((alias) => normalized(alias) === key)) ?? null;
}

function findGroup(groups: readonly SpeakerGroup[], npc: RuntimeObject | null, reference: unknown): SpeakerGroup | undefined {
  const keys = new Set([reference, ...aliasesOf(npc)].map(normalized).filter(Boolean));
  return groups.find((group) => [group.charId, group.profile?.name].some((alias) => keys.has(normalized(alias))));
}

function stateNpc(state: unknown, canonicalId: string, reference: unknown): RuntimeObject | null {
  if (!state || typeof state !== 'object') return null;
  const npcs = (state as RuntimeObject).npcs;
  if (!npcs || typeof npcs !== 'object' || Array.isArray(npcs)) return null;
  const wanted = new Set([canonicalId, reference].map(normalized).filter(Boolean));
  const key = Object.keys(npcs).find((id) => wanted.has(normalized(id)));
  const value = key ? (npcs as RuntimeObject)[key] : null;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RuntimeObject : null;
}

function emotionOf(group: SpeakerGroup | undefined, requested: unknown, prefer?: (group: SpeakerGroup) => unknown): string | undefined {
  if (!group?.emotions || typeof group.emotions.keys !== 'function') return requested == null ? undefined : String(requested);
  const names = Array.from(group.emotions.keys(), String);
  const wanted = normalized(requested);
  const exact = wanted ? names.find((emotion) => normalized(emotion) === wanted) : undefined;
  const selected = exact ?? (prefer ? prefer(group) : names[0]);
  return selected == null ? undefined : String(selected);
}

export function resolveSpeaker(schema: unknown, state: unknown, reference: unknown, options: ResolveSpeakerOptions = {}): ResolvedSpeaker | null {
  const raw = String(reference == null ? '' : reference).trim();
  if (!raw) return null;
  const npc = findNpc(schema, raw);
  const group = findGroup(options.groups ?? [], npc, raw);
  const id = String(npc?.id ?? group?.charId ?? raw);
  const name = String(npc?.nameKo ?? npc?.name ?? npc?.nameEn ?? group?.profile?.name ?? id);
  const emotion = emotionOf(group, options.requestedEmotion, options.preferEmotion);
  const outfitValue = stateNpc(state, id, raw)?.outfit;
  const outfit = Number.isFinite(Number(outfitValue)) ? Number(outfitValue) : undefined;
  const picked = group && emotion && options.pickAsset ? options.pickAsset(group, emotion, outfit) : null;
  return { id, name, ...(outfit === undefined ? {} : { outfit }), ...(emotion === undefined ? {} : { emotion }), ...(npc ? { npc } : {}), ...(group ? { group } : {}), ...(picked?.asset === undefined ? {} : { asset: picked.asset }) };
}

export function resolveSpeakerList(schema: unknown, state: unknown, items: readonly SpeakerReference[] | null | undefined, options: Omit<ResolveSpeakerOptions, 'requestedEmotion'> = {}): ResolvedSpeakerEntry[] {
  const resolved: Array<ResolvedSpeakerEntry & { requestedFocus: boolean }> = [];
  const byId = new Map<string, ResolvedSpeakerEntry & { requestedFocus: boolean }>();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const speaker = resolveSpeaker(schema, state, item.npcId, { ...options, requestedEmotion: item.emotion });
    if (!speaker) continue;
    const existing = byId.get(speaker.id);
    if (existing) { if (item.focus === true) existing.requestedFocus = true; continue; }
    const entry: ResolvedSpeakerEntry & { requestedFocus: boolean } = { npcId: speaker.id, name: speaker.name, focus: false, requestedFocus: item.focus === true, ...(speaker.emotion === undefined ? {} : { emotion: speaker.emotion }), ...(speaker.outfit === undefined ? {} : { outfit: speaker.outfit }) };
    byId.set(speaker.id, entry);
    resolved.push(entry);
    if (resolved.length === 3) break;
  }
  let focusIndex = -1;
  for (let index = 0; index < resolved.length; index += 1) if (resolved[index]!.requestedFocus) focusIndex = index;
  if (focusIndex < 0 && resolved.length) focusIndex = resolved.length - 1;
  return resolved.map(({ requestedFocus: _requestedFocus, ...entry }, index) => ({ ...entry, focus: index === focusIndex }));
}
