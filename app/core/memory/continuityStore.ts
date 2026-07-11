// SPDX-License-Identifier: GPL-3.0-or-later
// 세션 단위 서사 기억 저장소. LLM 출력은 언제나 후보이며, 사용자 원문이나 성공한 엔진
// 사건처럼 다시 확인 가능한 근거가 있을 때만 자동 승인한다.

import type {
  MemoryKind,
  MemoryKnowledge,
  MemoryLifecycle,
  MemoryRecord,
  RetrievalPlan,
} from './contracts.ts';
import { createGroundedLexicalSearch } from './groundedLexical.ts';
import { planGroundedHybrid } from './groundedPlanner.ts';

export const CONTINUITY_MEMORY_CONTRACT = 'continuity-memory/0.1' as const;

const ALLOWED_KINDS = new Set<MemoryKind>([
  'engine-fact', 'event', 'promise', 'secret', 'relation', 'episode', 'summary',
]);

export interface MemoryCandidateInput {
  kind?: string;
  text?: string;
  entities?: string[];
  evidenceQuote?: string;
  eventIds?: string[];
  canonicalKey?: string;
  knowledgeScope?: string;
  importance?: number;
  knowledge?: MemoryKnowledge;
  lifecycle?: MemoryLifecycle;
}

export interface MemoryEvidenceEvent {
  id: string;
  index: number;
  ok: boolean;
  summary: string;
}

export interface MemoryTurnInput {
  turn: number;
  sceneId?: string;
  userMessage?: { id: string; content: string };
  assistantMessage?: { id: string; content: string };
  candidates: MemoryCandidateInput[];
  events?: MemoryEvidenceEvent[];
}

export interface MemoryDecision {
  recordId: string;
  status: MemoryRecord['status'];
  reason: 'user-quote' | 'engine-event' | 'duplicate' | 'needs-review' | 'invalid';
}

export interface FactReferenceInput {
  claim: string;
  refs: string[];
}

export interface FactReferenceVerdict extends FactReferenceInput {
  ok: boolean;
  invalidRefs: string[];
}

export interface ContinuityPatchInput {
  confirmMemoryIds?: string[];
  resolveMemoryIds?: string[];
  reason?: string;
}

export interface ContinuityPatchRecord {
  id: string;
  turn: number;
  confirmMemoryIds: string[];
  resolveMemoryIds: string[];
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
}

export interface ContinuityMemoryExport {
  contract: typeof CONTINUITY_MEMORY_CONTRACT;
  nextId: number;
  records: MemoryRecord[];
  nextPatchId?: number;
  patches?: ContinuityPatchRecord[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanStrings(value: unknown, maxItems = 12, maxChars = 120): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = cleanString(item, maxChars);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function scopeOf(candidate: MemoryCandidateInput): string {
  const scope = cleanString(candidate.knowledgeScope, 100);
  if (scope === 'public' || scope === 'user' || /^entity:[A-Za-z0-9_.:-]+$/.test(scope)) return scope;
  if (candidate.kind === 'secret' || candidate.knowledge?.privacy === 'secret' || candidate.knowledge?.privacy === 'private') return 'user';
  return 'public';
}

function knowledgeOf(candidate: MemoryCandidateInput, scope: string): MemoryKnowledge | undefined {
  const source = candidate.knowledge;
  if (!source || typeof source !== 'object') {
    if (scope === 'public') return undefined;
    const entityId = scope.startsWith('entity:') ? scope.slice(7) : 'user';
    return { privacy: scope === 'user' ? 'private' : 'shared', holderEntityIds: [entityId], visibleToEntityIds: [entityId] };
  }
  const allowedType = ['experienced', 'witnessed', 'heard', 'inferred', 'rumor', 'private-thought', 'public-fact'];
  const allowedState = ['known', 'suspected', 'uncertain', 'misunderstood', 'forgotten', 'hidden'];
  const allowedPrivacy = ['public', 'shared', 'private', 'secret', 'internal'];
  const allowedTruth = ['true', 'false', 'contested', 'unknown'];
  return {
    ...(allowedType.includes(String(source.type)) ? { type: source.type } : {}),
    ...(allowedState.includes(String(source.state)) ? { state: source.state } : {}),
    ...(allowedPrivacy.includes(String(source.privacy)) ? { privacy: source.privacy } : {}),
    ...(allowedTruth.includes(String(source.truth)) ? { truth: source.truth } : {}),
    visibleToEntityIds: cleanStrings(source.visibleToEntityIds),
    deniedToEntityIds: cleanStrings(source.deniedToEntityIds),
    holderEntityIds: cleanStrings(source.holderEntityIds),
    inferredByEntityIds: cleanStrings(source.inferredByEntityIds),
  };
}

function lifecycleOf(candidate: MemoryCandidateInput): MemoryLifecycle | undefined {
  const source = candidate.lifecycle;
  if (!source || typeof source !== 'object') return undefined;
  const states = ['active', 'resolved', 'dormant', 'superseded', 'no-longer-true'];
  const scopes = ['current', 'past', 'unknown'];
  return {
    ...(states.includes(String(source.state)) ? { state: source.state } : {}),
    ...(scopes.includes(String(source.timeScope)) ? { timeScope: source.timeScope } : {}),
  };
}

function statusAt(record: MemoryRecord, turn: number): MemoryRecord {
  return { ...record, status: 'approved', validFromTurn: Math.min(record.validFromTurn, turn) };
}

export function createContinuityMemoryStore(initial?: ContinuityMemoryExport) {
  let nextId = initial?.nextId && Number.isInteger(initial.nextId) && initial.nextId > 0 ? initial.nextId : 1;
  let nextPatchId = initial?.nextPatchId && Number.isInteger(initial.nextPatchId) && initial.nextPatchId > 0 ? initial.nextPatchId : 1;
  let records: MemoryRecord[] = Array.isArray(initial?.records) ? clone(initial!.records) : [];
  let patches: ContinuityPatchRecord[] = Array.isArray(initial?.patches) ? clone(initial!.patches) : [];

  function ingestTurn(input: MemoryTurnInput): MemoryDecision[] {
    const decisions: MemoryDecision[] = [];
    const turn = Number(input.turn);
    if (!Number.isInteger(turn) || turn < 0) return [{ recordId: '', status: 'rejected', reason: 'invalid' }];
    const successfulEvents = (input.events ?? []).filter((event) => event && event.ok && Number.isInteger(event.index));
    const userText = String(input.userMessage?.content ?? '');

    for (const raw of (input.candidates ?? []).slice(0, 12)) {
      if (!raw || typeof raw !== 'object') continue;
      const candidateText = cleanString(raw.text);
      const evidenceQuote = cleanString(raw.evidenceQuote, 300);
      const kind = ALLOWED_KINDS.has(raw.kind as MemoryKind) ? raw.kind as MemoryKind : 'episode';
      const requestedEventIds = new Set(cleanStrings(raw.eventIds, 8, 100));
      const matchedEvents = successfulEvents.filter((event) => requestedEventIds.has(event.id));
      const quoteVerified = evidenceQuote.length >= 4 && userText.includes(evidenceQuote);
      const approved = quoteVerified || matchedEvents.length > 0;
      const storedText = matchedEvents.length
        ? matchedEvents.map((event) => cleanString(event.summary)).filter(Boolean).join(' / ')
        : quoteVerified ? evidenceQuote : candidateText;
      if (!storedText) {
        decisions.push({ recordId: '', status: 'rejected', reason: 'invalid' });
        continue;
      }

      const normalized = storedText.normalize('NFKC').toLocaleLowerCase();
      const duplicate = records.find((record) => record.text.normalize('NFKC').toLocaleLowerCase() === normalized && record.status !== 'rejected');
      if (duplicate) {
        decisions.push({ recordId: duplicate.id, status: duplicate.status, reason: 'duplicate' });
        continue;
      }

      const id = `memory-${String(nextId).padStart(6, '0')}`;
      nextId += 1;
      const sourceMessageIds = cleanStrings([
        ...(quoteVerified && input.userMessage?.id ? [input.userMessage.id] : []),
        ...(input.assistantMessage?.id ? [input.assistantMessage.id] : []),
      ]);
      const scope = scopeOf(raw);
      const record: MemoryRecord = {
        id,
        // 사건·관계 서사는 "근거 있는 기억"이지 모든 후속 프롬프트에 상시 주입할 현재
        // 엔진 상태가 아니다. 현재 사실은 engine state가 따로 소유하므로 episode로 보관한다.
        kind: ['event', 'relation', 'engine-fact'].includes(kind) ? 'episode' : kind,
        text: storedText,
        sourceMessageIds,
        sourceEventIndexes: matchedEvents.map((event) => event.index),
        entities: cleanStrings(raw.entities),
        createdTurn: turn,
        validFromTurn: turn,
        validToTurn: null,
        supersedes: [],
        importance: Math.max(0, Math.min(1, Number.isFinite(Number(raw.importance)) ? Number(raw.importance) : 0.5)),
        knowledgeScope: scope,
        status: approved ? 'approved' : 'candidate',
        canonicalAnchors: cleanStrings([raw.canonicalKey, ...(raw.entities ?? [])]),
        ...(input.sceneId ? { sceneId: cleanString(input.sceneId, 120), sourceLocator: { sceneId: cleanString(input.sceneId, 120) } } : {}),
        ...(knowledgeOf(raw, scope) ? { knowledge: knowledgeOf(raw, scope) } : {}),
        ...(lifecycleOf(raw) ? { lifecycle: lifecycleOf(raw) } : {}),
      };
      records.push(record);
      decisions.push({ recordId: id, status: record.status, reason: matchedEvents.length ? 'engine-event' : quoteVerified ? 'user-quote' : 'needs-review' });
    }
    return decisions;
  }

  function approve(recordId: string, turn: number): MemoryRecord {
    const index = records.findIndex((record) => record.id === recordId);
    if (index < 0) throw new RangeError(`unknown_memory:${recordId}`);
    if (records[index].status === 'rejected') throw new RangeError(`rejected_memory:${recordId}`);
    records[index] = statusAt(records[index], turn);
    return clone(records[index]);
  }

  function reject(recordId: string): MemoryRecord {
    const index = records.findIndex((record) => record.id === recordId);
    if (index < 0) throw new RangeError(`unknown_memory:${recordId}`);
    records[index] = { ...records[index], status: 'rejected' };
    return clone(records[index]);
  }

  async function retrieve(query: string, config: {
    atTurn: number;
    sceneId?: string;
    viewerScopes?: string[];
    viewerEntityIds?: string[];
    entityAliases?: Record<string, string[]>;
    topK?: number;
    minConfidence?: number;
  }): Promise<{ plan: RetrievalPlan; records: MemoryRecord[] }> {
    const snapshot = clone(records);
    const plan = await planGroundedHybrid(snapshot, query, { lexicalSearch: createGroundedLexicalSearch(snapshot) }, {
      atTurn: config.atTurn,
      sceneId: config.sceneId,
      viewerScopes: config.viewerScopes ?? ['public', 'user'],
      viewerEntityIds: config.viewerEntityIds ?? ['user'],
      entityAliases: config.entityAliases,
      topK: config.topK ?? 8,
      abstention: { gate: 'soft', minConfidence: config.minConfidence ?? 0.28, calibrated: false },
    });
    return { plan, records: snapshot };
  }

  function list(status?: MemoryRecord['status']): MemoryRecord[] {
    return clone(status ? records.filter((record) => record.status === status) : records);
  }

  function reconcileSources(input: { messageIds: string[]; eventIndexes: number[]; atTurn: number }): string[] {
    const messages = new Set(cleanStrings(input.messageIds, 50000, 120));
    const events = new Set((Array.isArray(input.eventIndexes) ? input.eventIndexes : []).filter(Number.isInteger));
    const removed: string[] = [];
    records = records.map((record) => {
      const hadSources = record.sourceMessageIds.length > 0 || record.sourceEventIndexes.length > 0;
      const hasLiveSource = record.sourceMessageIds.some((id) => messages.has(id)) || record.sourceEventIndexes.some((index) => events.has(index));
      if (!hadSources || hasLiveSource || record.status === 'rejected' || record.status === 'superseded') return record;
      removed.push(record.id);
      return {
        ...record,
        status: 'superseded',
        validToTurn: Math.max(record.validFromTurn, Number.isInteger(input.atTurn) ? input.atTurn : record.validFromTurn),
        lifecycle: { ...(record.lifecycle ?? {}), state: 'superseded', timeScope: 'past' },
      };
    });
    return removed;
  }

  function proposePatch(input: ContinuityPatchInput, turn: number): ContinuityPatchRecord | null {
    const confirmMemoryIds = cleanStrings(input?.confirmMemoryIds, 20, 120).filter((id) => records.some((record) => record.id === id));
    const resolveMemoryIds = cleanStrings(input?.resolveMemoryIds, 20, 120).filter((id) => records.some((record) => record.id === id));
    if (!confirmMemoryIds.length && !resolveMemoryIds.length) return null;
    const patch: ContinuityPatchRecord = {
      id: `continuity-patch-${String(nextPatchId).padStart(6, '0')}`,
      turn: Number.isInteger(turn) ? turn : 0,
      confirmMemoryIds,
      resolveMemoryIds,
      reason: cleanString(input?.reason, 300),
      status: 'pending',
    };
    nextPatchId += 1;
    patches.push(patch);
    return clone(patch);
  }

  function applyPatch(patchId: string, turn: number): ContinuityPatchRecord {
    const patchIndex = patches.findIndex((patch) => patch.id === patchId);
    if (patchIndex < 0) throw new RangeError(`unknown_continuity_patch:${patchId}`);
    if (patches[patchIndex].status !== 'pending') throw new RangeError(`continuity_patch_not_pending:${patchId}`);
    const patch = patches[patchIndex];
    for (const id of patch.confirmMemoryIds) {
      const index = records.findIndex((record) => record.id === id);
      if (index >= 0 && records[index].status === 'candidate') records[index] = statusAt(records[index], turn);
    }
    for (const id of patch.resolveMemoryIds) {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0 || records[index].status === 'rejected') continue;
      records[index] = {
        ...records[index],
        status: 'superseded',
        validToTurn: Math.max(records[index].validFromTurn, turn),
        lifecycle: { ...(records[index].lifecycle ?? {}), state: 'resolved', timeScope: 'past' },
      };
    }
    patches[patchIndex] = { ...patch, status: 'applied' };
    return clone(patches[patchIndex]);
  }

  function rejectPatch(patchId: string): ContinuityPatchRecord {
    const index = patches.findIndex((patch) => patch.id === patchId);
    if (index < 0) throw new RangeError(`unknown_continuity_patch:${patchId}`);
    if (patches[index].status !== 'pending') throw new RangeError(`continuity_patch_not_pending:${patchId}`);
    patches[index] = { ...patches[index], status: 'rejected' };
    return clone(patches[index]);
  }

  function listPatches(status?: ContinuityPatchRecord['status']): ContinuityPatchRecord[] {
    return clone(status ? patches.filter((patch) => patch.status === status) : patches);
  }

  function toJSON(): ContinuityMemoryExport {
    return { contract: CONTINUITY_MEMORY_CONTRACT, nextId, records: clone(records), nextPatchId, patches: clone(patches) };
  }

  return { ingestTurn, approve, reject, retrieve, list, reconcileSources, proposePatch, applyPatch, rejectPatch, listPatches, toJSON };
}

export function restoreContinuityMemoryStore(payload: unknown) {
  if (!payload || typeof payload !== 'object' || (payload as ContinuityMemoryExport).contract !== CONTINUITY_MEMORY_CONTRACT) {
    throw new TypeError('continuity_memory_contract_mismatch');
  }
  const parsed = payload as ContinuityMemoryExport;
  if (!Array.isArray(parsed.records)) throw new TypeError('continuity_memory_records_required');
  if (parsed.records.length > 50000) throw new TypeError('continuity_memory_too_large');
  for (const record of parsed.records) {
    if (!record || typeof record !== 'object'
      || typeof record.id !== 'string' || !record.id.trim()
      || typeof record.text !== 'string'
      || !ALLOWED_KINDS.has(record.kind)
      || !['candidate', 'approved', 'rejected', 'superseded'].includes(record.status)
      || !Array.isArray(record.sourceMessageIds)
      || !Array.isArray(record.sourceEventIndexes)
      || !Array.isArray(record.entities)
      || !Number.isInteger(record.createdTurn)
      || !Number.isInteger(record.validFromTurn)) {
      throw new TypeError('continuity_memory_record_invalid');
    }
  }
  if (parsed.patches != null && !Array.isArray(parsed.patches)) throw new TypeError('continuity_memory_patches_invalid');
  for (const patch of parsed.patches ?? []) {
    if (!patch || typeof patch.id !== 'string' || !Array.isArray(patch.confirmMemoryIds) || !Array.isArray(patch.resolveMemoryIds)
      || !['pending', 'applied', 'rejected'].includes(patch.status)) throw new TypeError('continuity_memory_patch_invalid');
  }
  return createContinuityMemoryStore(parsed);
}

export function formatGroundedMemory(plan: RetrievalPlan, records: MemoryRecord[]): string {
  const byId = new Map(records.map((record) => [record.id, record]));
  const ordered = [...plan.currentFacts, ...plan.hits];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const hit of ordered) {
    if (seen.has(hit.recordId)) continue;
    seen.add(hit.recordId);
    const record = byId.get(hit.recordId);
    if (!record || record.status !== 'approved') continue;
    const sources = [
      ...record.sourceMessageIds.map((id) => `message:${id}`),
      ...record.sourceEventIndexes.map((index) => `event:${index}`),
    ];
    const uncertain = hit.selectedBecause.includes('requires-uncertain-language') ? ' · 불확실한 정보로만 표현' : '';
    lines.push(`- [${record.id} · scope:${record.knowledgeScope}${sources.length ? ` · ${sources.join(',')}` : ''}${uncertain}] ${record.text}`);
  }
  return lines.join('\n');
}

export function validateFactReferences(input: FactReferenceInput[], context: {
  hasState: boolean;
  userMessageId?: string;
  events?: MemoryEvidenceEvent[];
}): FactReferenceVerdict[] {
  const successfulEventIds = new Set((context.events ?? []).filter((event) => event.ok).map((event) => event.id));
  return (input ?? []).slice(0, 20).map((item) => {
    const refs = cleanStrings(item?.refs, 12, 120);
    const invalidRefs = refs.filter((ref) => {
      if (ref === 'state') return !context.hasState;
      if (ref === 'user-message') return !context.userMessageId;
      if (ref.startsWith('event:')) return !successfulEventIds.has(ref.slice('event:'.length));
      return true;
    });
    return { claim: cleanString(item?.claim, 300), refs, ok: !!cleanString(item?.claim, 300) && refs.length > 0 && invalidRefs.length === 0, invalidRefs };
  });
}
