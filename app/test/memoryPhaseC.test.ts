// Phase C 오프라인 검증 — 실제 .ts provider/planner/gate를 실행한다(선언만 검사 아님).
// 외부 네트워크 호출 0 — fetch를 mock으로 주입. Node 24 네이티브 타입 스트리핑으로 실행:
//   node --test test/memoryPhaseC.test.ts  (package.json의 test:phasec)

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createVoyageProvider, maskSecrets, VOYAGE_LIMITS, VoyageError } from '../core/memory/providers/voyage.ts';
import { createEmbeddingCache, fnv1a } from '../core/memory/embeddingCache.ts';
import { decideAbstention, DEFAULT_ABSTENTION } from '../core/memory/abstention.ts';
import { planGroundedHybrid } from '../core/memory/groundedPlanner.ts';

const require = createRequire(import.meta.url);
const corpus = require('./fixtures/memory-benchmark/corpus.json');
const { buildLexicalIndex, lexicalSearch } = require('../core/memory/retrievers/lexical.js');

// ── mock fetch: 결정론 가짜 임베딩(요청 그룹 수만큼 벡터 반환) ──
function mockFetch(capture: { bodies: string[]; calls: number }, opts: { failTimes?: number; status?: number } = {}) {
  let n = 0;
  return async (_url: string, init: { body: string }) => {
    capture.calls += 1;
    capture.bodies.push(init.body);
    if (opts.failTimes && n < opts.failTimes) { n += 1; return { ok: false, status: opts.status ?? 429, json: async () => ({}), text: async () => 'rate limited' }; }
    const parsed = JSON.parse(init.body) as { inputs: string[][] };
    const data = parsed.inputs.map((group) => ({ embeddings: group.map((chunk) => [chunk.length % 7, (chunk.length * 3) % 5, 1]) }));
    return { ok: true, status: 200, json: async () => ({ data }), text: async () => '' };
  };
}
const noSleep = async () => {};
let clock = 0;
const now = () => (clock += 5);

test('voyage provider: document/query 직렬화와 input_type이 계약대로다', async () => {
  const cap = { bodies: [] as string[], calls: 0 };
  const p = createVoyageProvider({ apiKey: 'pa-secret-key-123456', fetchImpl: mockFetch(cap), sleep: noSleep, now });
  const docs = await p.embedDocumentGroups([['첫 조각', '둘째 조각'], ['다른 그룹']]);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].length, 2);
  const q = await p.embedQueries(['질의1', '질의2']);
  assert.equal(q.length, 2);
  const docBody = JSON.parse(cap.bodies[0]);
  assert.equal(docBody.input_type, 'document');
  const qBody = JSON.parse(cap.bodies[1]);
  assert.equal(qBody.input_type, 'query');
  assert.deepEqual(qBody.inputs, [['질의1'], ['질의2']]); // query는 각각 한 묶음
});

test('voyage provider: 캐시가 동일 입력 재호출을 막고 통계를 집계한다', async () => {
  const cap = { bodies: [] as string[], calls: 0 };
  const cache = createEmbeddingCache();
  const p = createVoyageProvider({ apiKey: 'pa-x', fetchImpl: mockFetch(cap), sleep: noSleep, now, cache });
  await p.embedDocumentGroups([['같은 텍스트']]);
  await p.embedDocumentGroups([['같은 텍스트']]); // 캐시 히트 → 네트워크 호출 없음
  assert.equal(cap.calls, 1);
  assert.ok(p.stats().cacheHits >= 1);
  assert.ok(p.stats().inputTokensEstimate > 0);
});

test('voyage provider: 429는 bounded backoff로 재시도하고 최대치 초과 시 실패한다', async () => {
  const cap = { bodies: [] as string[], calls: 0 };
  const okAfter = createVoyageProvider({ apiKey: 'pa-x', fetchImpl: mockFetch(cap, { failTimes: 2, status: 429 }), sleep: noSleep, now, maxRetries: 4 });
  const r = await okAfter.embedQueries(['q']);
  assert.equal(r.length, 1);
  assert.equal(okAfter.stats().retries, 2);

  const cap2 = { bodies: [] as string[], calls: 0 };
  const exhaust = createVoyageProvider({ apiKey: 'pa-x', fetchImpl: mockFetch(cap2, { failTimes: 9, status: 429 }), sleep: noSleep, now, maxRetries: 2 });
  await assert.rejects(() => exhaust.embedQueries(['q']), /voyage_retry_exhausted/);
});

test('voyage provider: 입력 한도를 초과하면 네트워크 전에 거부한다', async () => {
  const cap = { bodies: [] as string[], calls: 0 };
  const p = createVoyageProvider({ apiKey: 'pa-x', fetchImpl: mockFetch(cap), sleep: noSleep, now });
  const tooMany = Array.from({ length: VOYAGE_LIMITS.maxInputs + 1 }, () => ['x']);
  await assert.rejects(() => p.embedDocumentGroups(tooMany), VoyageError);
  assert.equal(cap.calls, 0); // 호출 자체가 없어야
});

test('voyage provider: 오류 메시지에 API 키가 노출되지 않는다', async () => {
  const key = 'pa-super-secret-abcdef';
  const failing = async () => { throw new Error(`connect fail with header authorization: Bearer ${key}`); };
  const p = createVoyageProvider({ apiKey: key, fetchImpl: failing as never, sleep: noSleep, now });
  await assert.rejects(() => p.embedQueries(['q']), (err: Error) => {
    assert.ok(!err.message.includes(key), '키가 에러에 노출됨');
    return true;
  });
  assert.equal(maskSecrets(`x ${key} y`, key).includes(key), false);
});

test('abstention: gate off는 절대 abstain 안 하고, soft는 저신뢰에서 abstain', () => {
  const hits = [{ recordId: 'a', score: 0.02, selectedBecause: [], sourceMessageIds: [], sourceEventIndexes: [] }];
  assert.equal(decideAbstention(hits, { gate: 'off', minConfidence: 0.15, calibrated: false }).abstain, false);
  assert.equal(decideAbstention(hits, DEFAULT_ABSTENTION).abstain, true);
  assert.equal(decideAbstention([], DEFAULT_ABSTENTION).abstain, true);
  assert.equal(DEFAULT_ABSTENTION.calibrated, false); // 실측 전 uncalibrated 표시
});

test('embeddingCache: 문맥 포함 결정론 키 + 히트/미스 통계', () => {
  const c = createEmbeddingCache();
  const k = c.key('voyage-context-3', 1024, 'document', 'ctx1', '텍스트');
  assert.equal(c.get(k), undefined);
  c.set(k, [1, 2, 3]);
  assert.deepEqual(c.get(k), [1, 2, 3]);
  assert.notEqual(k, c.key('voyage-context-3', 1024, 'document', 'ctx2', '텍스트')); // 문맥이 다르면 키가 다름
  assert.equal(fnv1a('a') === fnv1a('a'), true);
});

// ── Grounded Hybrid V2 (C2) — fixed lexical, semantic 없음/있음 결정론 ──
function lexFn(index: unknown) {
  return (query: string, k: number) => lexicalSearch(index, query, k).map((s: { recordId: string; score: number }) => ({ recordId: s.recordId, score: s.score }));
}
const ALIASES = { silvia: ['실비아', 'Silvia'], mirian: ['미리안', 'Mirian'], kang: ['강한결', 'Kang'], iris: ['아이리스', 'Iris'], sera: ['세라', 'Sera'] };

test('grounded: semantic provider 없어도 lexical-only로 fail-open 동작', async () => {
  const index = buildLexicalIndex(corpus.records);
  const plan = await planGroundedHybrid(corpus.records, '강한결의 비밀이 뭐였지?', { lexicalSearch: lexFn(index) }, { atTurn: 329, entityAliases: ALIASES, abstention: { gate: 'off', minConfidence: 0.15, calibrated: false } });
  assert.ok(plan.reason!.includes('lexical-only'));
  assert.ok(plan.hits.length > 0);
});

test('grounded: 롤백된(폐기) 기억은 기본적으로 주입 후보에서 제외된다', async () => {
  const index = buildLexicalIndex(corpus.records);
  const plan = await planGroundedHybrid(corpus.records, '골드가 얼마였지?', { lexicalSearch: lexFn(index) }, { atTurn: 329, abstention: { gate: 'off', minConfidence: 0, calibrated: false } });
  for (const hit of plan.hits) {
    const rec = corpus.records.find((r: { id: string }) => r.id === hit.recordId);
    assert.ok(rec.validToTurn == null || rec.validToTurn >= 329, `폐기 기억 ${hit.recordId} 주입됨`);
  }
});

test('grounded: knowledgeScope로 비밀(user 전용)은 viewer 스코프 없으면 현재사실/주입에서 빠진다', async () => {
  const index = buildLexicalIndex(corpus.records);
  // viewer가 public만 볼 수 있으면 secret(user)·promise(entity:*)는 통과 못 함.
  const publicOnly = await planGroundedHybrid(corpus.records, '강한결 이중 등록 비밀', { lexicalSearch: lexFn(index) },
    { atTurn: 329, viewerScopes: ['public'], abstention: { gate: 'off', minConfidence: 0, calibrated: false } });
  for (const hit of publicOnly.hits) {
    const rec = corpus.records.find((r: { id: string }) => r.id === hit.recordId);
    assert.notEqual(rec.knowledgeScope, 'user');
  }
  // user 스코프를 주면 비밀이 보인다.
  const withUser = await planGroundedHybrid(corpus.records, '강한결 이중 등록 비밀', { lexicalSearch: lexFn(index) },
    { atTurn: 329, viewerScopes: ['public', 'user'], abstention: { gate: 'off', minConfidence: 0, calibrated: false } });
  assert.ok(withUser.hits.some((h) => corpus.records.find((r: { id: string }) => r.id === h.recordId).knowledgeScope === 'user'));
});

test('grounded: 결정론 — 같은 입력 두 번이 동일 결과', async () => {
  const index = buildLexicalIndex(corpus.records);
  const args = ['미리안이 도와주기로 한 일', { lexicalSearch: lexFn(index) }, { atTurn: 329, entityAliases: ALIASES }] as const;
  const a = await planGroundedHybrid(corpus.records, ...args);
  const b = await planGroundedHybrid(corpus.records, ...args);
  assert.deepEqual(a.hits.map((h) => h.recordId), b.hits.map((h) => h.recordId));
});
