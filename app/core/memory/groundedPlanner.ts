// SPDX-License-Identifier: GPL-3.0-or-later
// C2 — Grounded Hybrid V2. 우선순위:
//   authoritative engine facts > 유효 structured events > knowledgeScope 통과 narrative
//   > lexical sparse prefilter > (필요할 때만) semantic > evidence gate + abstention
// 순수 함수 — retriever(lexical/semantic)를 주입받아 JS 모듈 import 없이 타입체크 가능.
// 개념 참고: LIBRA evidence gate·rollback tombstone, RisuAI Agent recency decay (코드 미복사).
//   출처는 docs/THIRD_PARTY_PROVENANCE.md.

import type { MemoryRecord, RetrievalHit, RetrievalPlan } from './contracts.ts';
import { decideAbstention, DEFAULT_ABSTENTION } from './abstention.ts';
import type { AbstentionConfig } from './abstention.ts';

export interface ScoredId { recordId: string; score: number; }
export type LexicalSearchFn = (query: string, k: number) => ScoredId[];
export type SemanticSearchFn = (query: string, k: number) => Promise<ScoredId[]>;

export interface GroundedConfig {
  atTurn: number;
  viewerScopes?: string[];               // 이 관찰자가 볼 수 있는 knowledgeScope 집합
  entityAliases?: Record<string, string[]>; // npcId -> 표기들(NPC disambiguation)
  includeSuperseded?: boolean;           // 롤백된 과거값을 주입 후보에 넣을지(기본 false)
  budgetTokens?: number;
  perKindQuota?: Partial<Record<string, number>>;
  abstention?: AbstentionConfig;
  // evidence gate: 최상위 lexical 점수가 이 값 미만이면 semantic hit을 주입하지 않는다.
  semanticEvidenceFloor?: number;
  topK?: number;
}

const AUTHORITATIVE_KINDS = new Set(['engine-fact', 'relation', 'event']);
const DEFAULT_VIEWER_SCOPES = ['public', 'user'];

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

function scopeAllowed(record: MemoryRecord, viewerScopes: string[]): boolean {
  const scope = record.knowledgeScope || 'public';
  if (viewerScopes.includes(scope)) return true;
  // entity:<id> 스코프는 관찰자 스코프에 'entity:<id>'가 있을 때만 통과.
  return false;
}

function hitOf(record: MemoryRecord, extra: Partial<RetrievalHit>): RetrievalHit {
  return {
    recordId: record.id,
    score: 0,
    selectedBecause: [],
    sourceMessageIds: record.sourceMessageIds.slice(),
    sourceEventIndexes: record.sourceEventIndexes.slice(),
    ...extra,
  };
}

// 질의가 참조하는 엔티티 id 추출(별칭 substring). NPC disambiguation의 기반.
function referencedEntities(query: string, aliases: Record<string, string[]>): Set<string> {
  const found = new Set<string>();
  const q = query.toLowerCase();
  for (const [id, names] of Object.entries(aliases)) {
    for (const name of names) if (name && q.includes(String(name).toLowerCase())) { found.add(id); break; }
  }
  return found;
}

export async function planGroundedHybrid(
  records: MemoryRecord[],
  query: string,
  deps: { lexicalSearch: LexicalSearchFn; semanticSearch?: SemanticSearchFn },
  config: GroundedConfig,
): Promise<RetrievalPlan> {
  const atTurn = config.atTurn;
  const viewerScopes = config.viewerScopes ?? DEFAULT_VIEWER_SCOPES;
  const aliases = config.entityAliases ?? {};
  const includeSuperseded = config.includeSuperseded === true;
  const topK = config.topK ?? 20;
  const budgetTokens = config.budgetTokens ?? 2000;
  const abstentionCfg = config.abstention ?? DEFAULT_ABSTENTION;
  const evidenceFloor = config.semanticEvidenceFloor ?? 0.05;
  const byId = new Map(records.map((r) => [r.id, r]));

  // 유효 시점·승인·스코프·롤백 필터를 통과한 주입 가능 집합.
  function injectable(r: MemoryRecord): boolean {
    if (r.createdTurn > atTurn) return false;
    if (r.status !== 'approved') return false;               // LLM candidate 자동 승격 금지
    if (!includeSuperseded && r.validToTurn != null && r.validToTurn < atTurn) return false; // rollback tombstone
    if (!scopeAllowed(r, viewerScopes)) return false;        // knowledgeScope gate
    return true;
  }

  // 1) authoritative 현재 사실(폐기값 제외) — 절대 semantic으로 대체하지 않는다.
  const currentFacts = records
    .filter((r) => r.validFromTurn <= atTurn && (r.validToTurn == null || r.validToTurn >= atTurn))
    .filter((r) => AUTHORITATIVE_KINDS.has(r.kind) && scopeAllowed(r, viewerScopes))
    .map((r) => hitOf(r, { selectedBecause: ['authoritative-current'] }));

  const refEntities = referencedEntities(query, aliases);

  // 2) lexical sparse prefilter.
  const lex = deps.lexicalSearch(query, topK * 3).filter((s) => byId.has(s.recordId) && injectable(byId.get(s.recordId)!));
  const topLexScore = lex.length ? lex[0].score : 0;

  // 3) semantic — evidence gate: lexical 근거가 충분할 때만, 그리고 provider가 있을 때만.
  let sem: ScoredId[] = [];
  let semanticUsed = false;
  if (deps.semanticSearch && topLexScore >= evidenceFloor) {
    sem = (await deps.semanticSearch(query, topK * 3)).filter((s) => byId.has(s.recordId) && injectable(byId.get(s.recordId)!));
    semanticUsed = true;
  }

  // 4) 융합 — lexical 순위 우선(1/(rank)), semantic은 보조 가산. entity 일치는 부스트, 다른 참조
  //    엔티티만 담은 hit은 소폭 감점(NPC disambiguation).
  const score = new Map<string, number>();
  const because = new Map<string, string[]>();
  const bump = (id: string, s: number, tag: string) => {
    score.set(id, (score.get(id) || 0) + s);
    const list = because.get(id) || []; if (!list.includes(tag)) list.push(tag); because.set(id, list);
  };
  lex.forEach((s, i) => bump(s.recordId, 1 / (i + 1), 'lexical'));
  sem.forEach((s, i) => bump(s.recordId, 0.5 / (i + 1), 'semantic'));
  if (refEntities.size) {
    for (const id of score.keys()) {
      const rec = byId.get(id)!;
      const recEnts = new Set(rec.entities);
      const hasRef = [...refEntities].some((e) => recEnts.has(e));
      const hasOtherRef = [...recEnts].some((e) => !refEntities.has(e) && Object.prototype.hasOwnProperty.call(aliases, e));
      if (hasRef) bump(id, 0.5, 'entity-match');
      else if (hasOtherRef && recEnts.size > 0) bump(id, -0.3, 'other-entity');
    }
  }

  // importance(사용자 고정) 미세 부스트.
  for (const id of score.keys()) {
    const rec = byId.get(id)!;
    if (rec.importance > 0.5) bump(id, 0.02 * rec.importance, 'important');
  }

  const ranked = [...score.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([id, s]) => hitOf(byId.get(id)!, { score: s, selectedBecause: because.get(id) || [] }));

  // 5) token budget + per-kind quota.
  const perKindQuota = config.perKindQuota ?? {};
  const kindUsed: Record<string, number> = {};
  const hits: RetrievalHit[] = [];
  let tokens = 0;
  for (const hit of ranked) {
    if (hits.length >= topK) break;
    const rec = byId.get(hit.recordId)!;
    const quota = perKindQuota[rec.kind];
    if (quota != null && (kindUsed[rec.kind] || 0) >= quota) continue;
    const t = estimateTokens(rec.text);
    if (tokens + t > budgetTokens && hits.length > 0) break;
    hits.push(hit);
    tokens += t;
    kindUsed[rec.kind] = (kindUsed[rec.kind] || 0) + 1;
  }

  // 6) evidence gate + abstention.
  const decision = decideAbstention(hits, abstentionCfg);
  return {
    hits: decision.abstain ? [] : hits,
    currentFacts,
    abstained: decision.abstain,
    confidence: decision.confidence,
    reason: `${decision.reason}${semanticUsed ? '' : '|lexical-only'}`,
  };
}
