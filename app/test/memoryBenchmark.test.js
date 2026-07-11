'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const corpus = require('./fixtures/memory-benchmark/corpus.json');
const questionsFile = require('./fixtures/memory-benchmark/questions.json');
const { createFixedEmbeddingProvider, embedOne } = require('../core/memory/providers/fixed.js');
const { buildLexicalIndex } = require('../core/memory/retrievers/lexical.js');
const { buildSemanticIndex } = require('../core/memory/retrievers/semantic.js');
const planner = require('../core/memory/contextPlanner.js');
const { evaluate, relevantIdsOf } = require('../core/memory/benchmark.js');
const { reciprocalRankFusion, weightedScoreCombination, normalizeScores, cosineSimilarity } = require('../core/memory/ranking.js');

const questions = questionsFile.questions;
const CATEGORIES = ['current-fact', 'superseded', 'promise-secret-relation', 'paraphrase', 'npc-disambiguation', 'negative'];

// ── Phase A: 코퍼스·정답지 무결성 (테스트 중 생성 없음 — 커밋 fixture만 읽음) ──

test('코퍼스는 300턴 규모이고 정답지는 6종 카테고리 각 20문항이다', () => {
  assert.equal(corpus.contract, 'memory-benchmark-corpus/0.2');
  assert.ok(corpus.messages.length >= 300, `messages ${corpus.messages.length}`);
  assert.equal(questions.length, 120);
  for (const cat of CATEGORIES) assert.equal(questions.filter((q) => q.category === cat).length, 20, cat);
});

test('모든 record는 knowledgeScope를 가지며 비밀은 user, 약속은 entity 스코프다(C0-4)', () => {
  for (const r of corpus.records) {
    assert.ok(typeof r.knowledgeScope === 'string' && r.knowledgeScope.length > 0, r.id);
    if (r.kind === 'secret') assert.equal(r.knowledgeScope, 'user', r.id);
    if (r.kind === 'promise') assert.ok(r.knowledgeScope.startsWith('entity:') || r.knowledgeScope === 'user', r.id);
  }
});

test('C0 지표: current-fact 정확도는 authoritative를 주는 B·D만 1.0, A·C는 0이고 abstention 계약이 노출된다', async () => {
  const r = await runAll();
  assert.equal(r.lexical.facts.currentFactExactMatch, 1);
  assert.equal(r.hybrid.facts.currentFactExactMatch, 1);
  assert.equal(r.recent.facts.currentFactExactMatch, 0);
  // 기준선 planner들은 abstention 계약이 없어 negative에서 abstain하지 못한다(C2가 메울 공백).
  assert.equal(r.lexical.facts.negativeAbstentionRate, 0);
  // 출처 보유율과 근거 precision은 서로 다른 지표로 분리 보고된다.
  assert.ok(r.lexical.retrieval.sourcePresenceRate > r.lexical.retrieval.attributionPrecision);
});

test('모든 정답의 relevantMessageId·supersededRecordId가 실제 코퍼스에 존재한다', () => {
  const msgIds = new Set(corpus.messages.map((m) => m.id));
  const recIds = new Set(corpus.records.map((r) => r.id));
  for (const q of questions) {
    for (const id of q.relevantMessageIds) assert.ok(msgIds.has(id), `${q.queryId} msg ${id}`);
    for (const id of q.supersededRecordIds) assert.ok(recIds.has(id), `${q.queryId} rec ${id}`);
    if (q.category === 'negative') assert.equal(q.relevantMessageIds.length, 0);
    else assert.ok(q.relevantMessageIds.length >= 1, `${q.queryId} needs a relevant message`);
  }
});

test('superseded 정답 record는 실제로 폐기된 값(validToTurn != null)을 가리킨다', () => {
  for (const q of questions.filter((x) => x.category === 'superseded')) {
    const rel = relevantIdsOf(q, corpus);
    for (const id of rel) {
      const rec = corpus.records.find((r) => r.id === id);
      assert.ok(rec.validToTurn != null, `${q.queryId} → ${id} should be superseded`);
    }
  }
});

// ── 랭킹 유틸(Risu 이식) 단위 검증 ──

test('RRF·CC·normalize·cosine 유틸이 결정론적이고 계약대로다', () => {
  assert.deepEqual(reciprocalRankFusion([['a', 'b'], ['b', 'c']]), ['b', 'a', 'c']);
  assert.deepEqual(weightedScoreCombination([[['a', 1], ['b', 0.5]], [['b', 1]]]), ['b', 'a']);
  assert.deepEqual(normalizeScores([['a', 10], ['b', 20]]), [['a', 0], ['b', 1]]);
  assert.deepEqual(normalizeScores([['a', 5], ['b', 5]]), [['a', 1], ['b', 1]]);
  assert.ok(cosineSimilarity([1, 0], [1, 0]) === 1);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});

test('고정 임베딩 provider는 완전 결정론(같은 텍스트=같은 벡터)이다', () => {
  const a = embedOne('실비아가 옥상에서 만나자고 약속했다', 128);
  const b = embedOne('실비아가 옥상에서 만나자고 약속했다', 128);
  assert.deepEqual(a, b);
  assert.equal(a.length, 128);
  const different = embedOne('전혀 다른 문장', 128);
  assert.notDeepEqual(a, different);
});

// ── Phase B: 네 비교군 실행과 불변식 ──

async function runAll() {
  const provider = createFixedEmbeddingProvider({ dimension: 256 });
  const lexicalIndex = buildLexicalIndex(corpus.records);
  const semanticIndex = await buildSemanticIndex(corpus.records, provider);
  const groups = {
    recent: (q) => planner.planRecentOnly(corpus, q),
    lexical: (q) => planner.planStructuredLexical(corpus, q, lexicalIndex),
    hypa: (q) => planner.planHypaV3(corpus, q, semanticIndex),
    hybrid: (q) => planner.planSimbotHybrid(corpus, q, lexicalIndex, semanticIndex),
  };
  const out = {};
  for (const [name, plan] of Object.entries(groups)) {
    const planResults = [];
    for (const q of questions) planResults.push({ question: q, plan: await plan(q) });
    out[name] = evaluate(planResults, corpus);
  }
  return out;
}

test('네 비교군이 실행되고 검색 지표가 산출된다', async () => {
  const r = await runAll();
  for (const name of ['recent', 'lexical', 'hypa', 'hybrid']) {
    assert.ok(r[name].retrieval.recallAt5 != null, name);
    assert.ok(r[name].retrieval.recallAt5 >= 0 && r[name].retrieval.recallAt5 <= 1, name);
  }
});

test('불변식: 구조화 경로(B·D)는 폐기 과거값을 현재 사실로 절대 노출하지 않는다', async () => {
  const r = await runAll();
  assert.equal(r.lexical.facts.supersededAsCurrentCount, 0);
  assert.equal(r.hybrid.facts.supersededAsCurrentCount, 0);
});

test('불변식: hybrid의 모든 상위 hit은 근거(message id 또는 event index)를 갖는다', async () => {
  const provider = createFixedEmbeddingProvider({ dimension: 256 });
  const lexicalIndex = buildLexicalIndex(corpus.records);
  const semanticIndex = await buildSemanticIndex(corpus.records, provider);
  for (const q of questions) {
    const plan = await planner.planSimbotHybrid(corpus, q, lexicalIndex, semanticIndex);
    for (const hit of plan.hits) {
      assert.ok((hit.sourceMessageIds && hit.sourceMessageIds.length) || (hit.sourceEventIndexes && hit.sourceEventIndexes.length), `${q.queryId} hit ${hit.recordId} 근거 없음`);
    }
  }
});

test('재현성: 같은 고정 provider·같은 코퍼스면 두 번 실행이 완전히 동일하다', async () => {
  const a = await runAll();
  const b = await runAll();
  assert.deepEqual(a.hybrid.retrieval, b.hybrid.retrieval);
  assert.deepEqual(a.hypa.retrieval, b.hypa.retrieval);
  assert.deepEqual(a.hybrid.per.map((p) => p.queryId), b.hybrid.per.map((p) => p.queryId));
});

test('구조화 검색이 최근창 기준선보다 검색 회수가 높다(파이프라인 타당성)', async () => {
  const r = await runAll();
  assert.ok(r.lexical.retrieval.recallAt5 > r.recent.retrieval.recallAt5, '구조화+어휘가 최근창만보다 나아야');
});

test('근거 정확도는 실제 정답 대비 precision — 오답 검색은 100%가 될 수 없다(착시 회귀 방지)', async () => {
  const r = await runAll();
  // precision@5는 상위5 중 정답 비율. 정답이 보통 1개이므로 R@5에 비례해 낮아야 하며 절대 100%가 아니다.
  for (const name of ['recent', 'lexical', 'hypa', 'hybrid']) {
    assert.ok(r[name].retrieval.attributionPrecision < 0.9, `${name} 근거정확도가 비현실적으로 높음(착시)`);
    assert.ok(r[name].retrieval.attributionPrecision >= 0, name);
  }
  // 회수가 높은 방식이 근거 정확도도 더 높아야(정답을 상위에 더 많이 올림).
  assert.ok(r.lexical.retrieval.attributionPrecision > r.recent.retrieval.attributionPrecision);
});

test('B·D는 동일한 authoritative 현재사실 집합을 사용한다(비교군 공정성)', async () => {
  const { buildLexicalIndex: bli } = require('../core/memory/retrievers/lexical.js');
  const provider = createFixedEmbeddingProvider({ dimension: 256 });
  const lexicalIndex = bli(corpus.records);
  const semanticIndex = await buildSemanticIndex(corpus.records, provider);
  const q = questions.find((x) => x.category === 'current-fact');
  const b = planner.planStructuredLexical(corpus, q, lexicalIndex);
  const d = await planner.planSimbotHybrid(corpus, q, lexicalIndex, semanticIndex);
  const idsB = b.currentFacts.map((h) => h.recordId).sort();
  const idsD = d.currentFacts.map((h) => h.recordId).sort();
  assert.deepEqual(idsB, idsD);
});
