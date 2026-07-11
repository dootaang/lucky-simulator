// SPDX-License-Identifier: GPL-3.0-or-later
// M1 — 장기 기억 검색 계층 계약. CLAUDE-TASK-HYPA §5.
// 결정론 원칙: 검색·랭킹은 순수 함수, 임베딩 provider는 교체 지점(fixed ↔ Voyage).

export type MemoryKind =
  | 'engine-fact' | 'event' | 'promise' | 'secret' | 'relation' | 'episode' | 'summary';

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  text: string;
  sourceMessageIds: string[];
  sourceEventIndexes: number[];
  entities: string[];
  createdTurn: number;
  validFromTurn: number;
  validToTurn: number | null;   // null이면 현재까지 유효
  supersedes: string[];         // 이 기록이 대체한 과거 기록 id
  importance: number;           // 0..1, 사용자 고정 기억 등
  status: 'candidate' | 'approved' | 'rejected' | 'superseded';
}

// 임베딩 provider — fixed(결정론, 외부 호출 없음) ↔ voyage(실호출)로 교체.
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimension: number;
  // 문서 그룹: 같은 요약/에피소드의 순서 있는 조각들을 한 묶음으로.
  embedDocumentGroups(groups: string[][]): Promise<number[][][]>;
  embedQueries(queries: string[]): Promise<number[][]>;
}

export interface RetrievalHit {
  recordId: string;
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
  recencyScore?: number;
  importanceScore?: number;
  selectedBecause: string[];
  sourceMessageIds: string[];
  sourceEventIndexes: number[];
}

export interface BenchmarkQuestion {
  queryId: string;
  category: 'current-fact' | 'superseded' | 'promise-secret-relation' | 'paraphrase' | 'npc-disambiguation' | 'negative';
  atTurn: number;
  query: string;
  expectedCurrentFacts: Record<string, string>;
  relevantMessageIds: string[];
  relevantEventIndexes: number[];
  supersededRecordIds: string[];
  forbiddenClaims: string[];
}

export interface CorpusMessage {
  id: string;
  turn: number;
  role: 'user' | 'assistant';
  content: string;
  entities: string[];
}

export interface BenchmarkCorpus {
  contract: 'memory-benchmark-corpus/0.1';
  seed: number;
  messages: CorpusMessage[];
  records: MemoryRecord[];
  questions: BenchmarkQuestion[];
}

export interface RetrievalMetrics {
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  ndcgAt10: number;
  attributionPrecision: number;
  supersededRejectionRate: number;
}

export interface FactMetrics {
  currentFactExactMatch: number;
  supersededAsCurrentCount: number;
  forbiddenClaimCount: number;
  npcConfusionCount: number;
}
