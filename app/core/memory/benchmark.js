'use strict';

// 벤치마크 지표 계산(CLAUDE-TASK §7) — 검색 지표와 사실·근거 지표를 분리.
// 순수 함수: 계획 결과(hits)와 정답지로부터 결정론적으로 지표를 낸다.

const { estimateTokens } = require('../lorebook/tokens.js');

function relevantIdsOf(question, corpus) {
  // 정답 record id = relevantMessageIds를 sourceMessageIds로 갖는 record.
  const ids = new Set();
  for (const record of corpus.records) {
    if (record.sourceMessageIds.some((mid) => question.relevantMessageIds.includes(mid))) ids.add(record.id);
  }
  return ids;
}

function recallAt(hits, relevant, k) {
  if (!relevant.size) return null; // negative 질문 등 정답 없음 → 집계 제외
  const top = hits.slice(0, k).map((h) => h.recordId);
  let found = 0;
  for (const id of relevant) if (top.includes(id)) found += 1;
  return found / relevant.size;
}

function reciprocalRank(hits, relevant) {
  if (!relevant.size) return null;
  for (let i = 0; i < hits.length; i += 1) if (relevant.has(hits[i].recordId)) return 1 / (i + 1);
  return 0;
}

function ndcgAt(hits, relevant, k) {
  if (!relevant.size) return null;
  let dcg = 0;
  for (let i = 0; i < Math.min(k, hits.length); i += 1) {
    if (relevant.has(hits[i].recordId)) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(k, relevant.size); i += 1) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

// 근거 정확도(precision@k) — 상위 k hit 중 실제 정답 근거(relevant record)인 비율.
// 감사 지적 반영: 이전 정의는 "출처 필드 존재"만 봐서 오답을 검색해도 100%가 나오는
// 착시였다. 이제 정답 집합 대비 정밀도를 재므로 무관한 검색은 점수가 떨어진다.
function attributionPrecision(hits, question, corpus, k = 5) {
  const relevant = relevantIdsOf(question, corpus);
  if (!relevant.size) return null; // 정답 없는 negative 등은 집계 제외
  const top = hits.slice(0, k);
  if (!top.length) return 0;
  let correct = 0;
  for (const hit of top) if (relevant.has(hit.recordId)) correct += 1;
  return correct / top.length;
}

// 폐기 기억 거부율 — supersededRecordIds가 상위 k "현재 사실"에 안 들어간 비율.
function supersededRejection(plan, question, k = 10) {
  if (!question.supersededRecordIds.length) return null;
  const factIds = new Set((plan.currentFacts || []).map((h) => h.recordId));
  const hitIds = new Set(plan.hits.slice(0, k).map((h) => h.recordId));
  let rejected = 0;
  for (const sid of question.supersededRecordIds) {
    // 현재 사실 블록에 없으면 거부 성공(회상 hits에는 있어도 됨).
    if (!factIds.has(sid)) rejected += 1;
  }
  return rejected / question.supersededRecordIds.length;
}

// 폐기 과거값을 "현재 사실"로 노출한 횟수(사실 지표).
function supersededAsCurrent(plan, question) {
  const factIds = new Set((plan.currentFacts || []).map((h) => h.recordId));
  let count = 0;
  for (const sid of question.supersededRecordIds) if (factIds.has(sid)) count += 1;
  return count;
}

// forbidden claim — 상위 k hit의 텍스트가 금지 문구를 담은 횟수.
function forbiddenClaims(plan, question, corpus, k = 5) {
  if (!question.forbiddenClaims.length) return 0;
  const top = plan.hits.slice(0, k);
  let count = 0;
  for (const hit of top) {
    const rec = corpus.records.find((r) => r.id === hit.recordId);
    if (!rec) continue;
    for (const forbidden of question.forbiddenClaims) if (rec.text.includes(forbidden)) { count += 1; break; }
  }
  return count;
}

function mean(values) {
  const nums = values.filter((v) => v != null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// 한 planner의 전체 질문 집계.
function evaluate(planResults, corpus, { budgetTokens = 2000 } = {}) {
  const per = [];
  for (const { question, plan } of planResults) {
    const relevant = relevantIdsOf(question, corpus);
    const selectedText = plan.hits.slice(0, 10).map((h) => (corpus.records.find((r) => r.id === h.recordId) || {}).text || '').join('\n');
    per.push({
      queryId: question.queryId,
      category: question.category,
      recallAt1: recallAt(plan.hits, relevant, 1),
      recallAt5: recallAt(plan.hits, relevant, 5),
      recallAt10: recallAt(plan.hits, relevant, 10),
      mrr: reciprocalRank(plan.hits, relevant),
      ndcgAt10: ndcgAt(plan.hits, relevant, 10),
      attributionPrecision: attributionPrecision(plan.hits, question, corpus, 5),
      supersededRejection: supersededRejection(plan, question, 10),
      supersededAsCurrent: supersededAsCurrent(plan, question),
      forbiddenClaims: forbiddenClaims(plan, question, corpus, 5),
      memoryTokens: estimateTokens(selectedText),
    });
  }
  const retrieval = {
    recallAt1: mean(per.map((p) => p.recallAt1)),
    recallAt5: mean(per.map((p) => p.recallAt5)),
    recallAt10: mean(per.map((p) => p.recallAt10)),
    mrr: mean(per.map((p) => p.mrr)),
    ndcgAt10: mean(per.map((p) => p.ndcgAt10)),
    attributionPrecision: mean(per.map((p) => p.attributionPrecision)),
    supersededRejectionRate: mean(per.map((p) => p.supersededRejection)),
  };
  const facts = {
    supersededAsCurrentCount: per.reduce((a, p) => a + p.supersededAsCurrent, 0),
    forbiddenClaimCount: per.reduce((a, p) => a + p.forbiddenClaims, 0),
  };
  const resources = {
    meanMemoryTokens: mean(per.map((p) => p.memoryTokens)),
    maxMemoryTokens: Math.max(0, ...per.map((p) => p.memoryTokens)),
    budgetTokens,
  };
  return { retrieval, facts, resources, per };
}

module.exports = { evaluate, relevantIdsOf };
