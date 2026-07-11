'use strict';

// 네 비교군의 검색 계획(CLAUDE-TASK Phase B). 각 planner는 질문에 대해
// 순위 매긴 RetrievalHit 목록과 "현재 사실 블록"(authoritative)을 돌려준다.
// 결정론: 모든 경로가 순수하거나 seed 기반. Math.random 미사용.
//
// 공통 원칙(ADR/DESIGN): authoritative 현재 사실은 절대 임베딩 결과로 대체하지 않는다.
// 폐기된 과거값(validToTurn != null)은 회상엔 나올 수 있어도 "현재 사실"엔 못 들어간다.

const { buildLexicalIndex, lexicalSearch } = require('./retrievers/lexical.js');
const { buildSemanticIndex, semanticSearch } = require('./retrievers/semantic.js');
const { reciprocalRankFusion } = require('./ranking.js');

function currentRecords(records, atTurn) {
  return records.filter((r) => r.validFromTurn <= atTurn && (r.validToTurn == null || r.validToTurn >= atTurn));
}

// authoritative "현재 사실"로 취급하는 종류 — B·D 비교군이 동일 집합을 쓰도록 공유
// (감사 지적: event 포함 여부가 두 플래너에서 엇갈렸음). 위치(event)·수치(engine-fact)·
// 관계(relation)는 전부 현재 상태이며, 폐기값은 currentRecords 필터가 이미 배제한다.
const CURRENT_FACT_KINDS = new Set(['engine-fact', 'relation', 'event']);
function authoritativeFacts(records, atTurn) {
  return currentRecords(records, atTurn).filter((r) => CURRENT_FACT_KINDS.has(r.kind));
}

function hitOf(record, extra) {
  return Object.assign({
    recordId: record.id,
    score: 0,
    selectedBecause: [],
    sourceMessageIds: record.sourceMessageIds.slice(),
    sourceEventIndexes: record.sourceEventIndexes.slice(),
  }, extra || {});
}

// A. Recent only — 최근 N개 메시지만. 앱의 실질 기준선.
function planRecentOnly(corpus, question, { recentMessages = 12 } = {}) {
  const upTo = corpus.messages.filter((m) => m.turn <= question.atTurn);
  const recent = upTo.slice(-recentMessages);
  const recentIds = new Set(recent.map((m) => m.id));
  // 최근 창에 원문 메시지가 있는 record를 최신 turn 순으로.
  const hits = corpus.records
    .filter((r) => r.sourceMessageIds.some((id) => recentIds.has(id)))
    .sort((a, b) => b.createdTurn - a.createdTurn)
    .map((r, i) => hitOf(r, { score: 1 / (i + 1), recencyScore: 1 / (i + 1), selectedBecause: ['recent-window'] }));
  return { hits, currentFacts: [] };
}

// B. Structured + lexical — 현재 사실 exact lookup + 어휘 검색.
function planStructuredLexical(corpus, question, lexicalIndex, { topK = 20 } = {}) {
  const currentFacts = authoritativeFacts(corpus.records, question.atTurn);
  const lex = lexicalSearch(lexicalIndex, question.query, topK);
  const hits = lex.map((s, i) => hitOf(s.record, { score: s.score, lexicalScore: s.score, selectedBecause: ['lexical', `rank-${i + 1}`] }));
  return { hits, currentFacts: currentFacts.map((r) => hitOf(r, { selectedBecause: ['structured-current'] })) };
}

// C. Hypa V3 reproduction — 중요·최근·유사 기억. 무작위는 seed로 격리.
// frozen summary 사용(요약 LLM 변동과 검색 품질을 섞지 않음 — CLAUDE-TASK §4-C).
async function planHypaV3(corpus, question, semanticIndex, options = {}) {
  const { recentRatio = 0.4, similarRatio = 0.4, budget = 20, seed = 1, includeRecentInQuery = true, queryChatCount = 3 } = options;
  // HypaV3 고증(hypav3.ts settings.queryChatCount 기본 3): semantic query에 평가 질문뿐 아니라
  // 그 시점의 최근 N개 메시지를 붙인다. 질문 단독 회수와 비교하려면 includeRecentInQuery:false.
  const recentMsgs = includeRecentInQuery
    ? corpus.messages.filter((m) => m.turn <= question.atTurn).slice(-queryChatCount).map((m) => m.content).join(' ')
    : '';
  const semanticQuery = includeRecentInQuery ? `${question.query} ${recentMsgs}`.trim() : question.query;
  const pool = corpus.records.filter((r) => r.createdTurn <= question.atTurn);
  const byRecent = pool.slice().sort((a, b) => b.createdTurn - a.createdTurn);
  const recentCount = Math.floor(budget * recentRatio);
  const similarCount = Math.floor(budget * similarRatio);
  const randomCount = Math.max(0, budget - recentCount - similarCount);

  const selected = new Map(); // recordId -> hit
  // 최근 기억
  for (const r of byRecent.slice(0, recentCount)) selected.set(r.id, hitOf(r, { score: 0.5, recencyScore: 0.5, selectedBecause: ['hypa-recent'] }));
  // 유사 기억(요약 조각 임베딩 → childToParentRRF는 semanticSearch가 처리)
  const sem = await semanticSearch(semanticIndex, semanticQuery, budget);
  let added = 0;
  for (const s of sem) {
    if (added >= similarCount) break;
    if (selected.has(s.recordId)) continue;
    const rec = corpus.records.find((r) => r.id === s.recordId);
    if (!rec || rec.createdTurn > question.atTurn) continue;
    selected.set(s.recordId, hitOf(rec, { score: s.score, semanticScore: s.score, selectedBecause: ['hypa-similar'] }));
    added += 1;
  }
  // 무작위 기억 — Math.random 대신 seed LCG(결정론 재현). hypa-compatible-random 격리.
  // 시드는 queryId 문자열 전체를 FNV 해시(감사 지적: length만 쓰면 같은 길이 질문끼리 셔플 충돌).
  const remaining = pool.filter((r) => !selected.has(r.id));
  let qhash = 2166136261;
  for (let i = 0; i < question.queryId.length; i += 1) { qhash ^= question.queryId.charCodeAt(i); qhash = Math.imul(qhash, 16777619); }
  let state = (seed ^ (qhash >>> 0)) >>> 0;
  const nextRand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const shuffled = remaining
    .map((r) => ({ r, k: nextRand() }))
    .sort((a, b) => (a.k - b.k) || (a.r.id < b.r.id ? -1 : 1))
    .map((x) => x.r);
  for (const r of shuffled.slice(0, randomCount)) selected.set(r.id, hitOf(r, { score: 0.1, selectedBecause: ['hypa-random-seeded'] }));

  return { hits: Array.from(selected.values()), currentFacts: [] };
}

// D. Simbot hybrid — authoritative facts > structured events > important > lexical > semantic > summary.
async function planSimbotHybrid(corpus, question, lexicalIndex, semanticIndex, { topK = 20, poolK = 50 } = {}) {
  // 1) authoritative 현재 사실 — B와 동일 집합, 폐기값 제외.
  const currentFacts = authoritativeFacts(corpus.records, question.atTurn);
  // 융합 전엔 넉넉히(poolK) 뽑고 최종만 topK로 자른다(감사 지적: 조기 삭감으로 상위 후보 유실 방지).
  const lex = lexicalSearch(lexicalIndex, question.query, poolK);
  const sem = await semanticSearch(semanticIndex, question.query, poolK);
  // 2) 어휘·의미 순위를 RRF로 융합해 relevance를 1순위로 두고, 사용자 고정 important 기억은
  //    약한 가산 부스트로만 반영한다(하드 재정렬은 정확 매칭을 밀어내 recall을 떨어뜨린다).
  const fused = reciprocalRankFusion([lex.map((s) => s.recordId), sem.map((s) => s.recordId)]);
  const rrfScore = new Map();
  fused.forEach((id, i) => rrfScore.set(id, 1 / (i + 1)));
  const ranked = fused
    .map((id) => {
      const rec = corpus.records.find((r) => r.id === id);
      if (!rec || rec.createdTurn > question.atTurn) return null;
      const boost = rrfScore.get(id) + 0.02 * (rec.importance || 0); // relevance 우선 + 미세 important 부스트
      return { rec, id, combined: boost };
    })
    .filter(Boolean)
    .sort((a, b) => (b.combined - a.combined) || (a.id < b.id ? -1 : 1));
  const hits = ranked.slice(0, topK).map(({ rec, id }) => {
    const lexHit = lex.find((s) => s.recordId === id);
    const semHit = sem.find((s) => s.recordId === id);
    const because = ['hybrid-rrf'];
    if (rec.importance > 0.5) because.push('important-boost');
    if (lexHit) because.push('lexical');
    if (semHit) because.push('semantic');
    return hitOf(rec, { score: rrfScore.get(id), lexicalScore: lexHit && lexHit.score, semanticScore: semHit && semHit.score, importanceScore: rec.importance, selectedBecause: because });
  });
  return { hits, currentFacts: currentFacts.map((r) => hitOf(r, { selectedBecause: ['authoritative-current'] })) };
}

module.exports = {
  currentRecords, buildLexicalIndex, buildSemanticIndex,
  planRecentOnly, planStructuredLexical, planHypaV3, planSimbotHybrid,
};
