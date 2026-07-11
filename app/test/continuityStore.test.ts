import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContinuityMemoryStore,
  formatGroundedMemory,
  restoreContinuityMemoryStore,
  validateFactReferences,
} from '../core/memory/continuityStore.ts';

test('memory pipeline: 근거 없는 LLM 기억은 후보로만 남고 검색에 주입되지 않는다', async () => {
  const store = createContinuityMemoryStore();
  const decisions = store.ingestTurn({
    turn: 12,
    userMessage: { id: 'm12u', content: '오늘은 날씨가 좋네.' },
    assistantMessage: { id: 'm12a', content: '실비아가 고개를 끄덕였다.' },
    candidates: [{ kind: 'promise', text: '실비아가 왕이 되겠다고 약속했다', entities: ['silvia'] }],
  });
  assert.equal(decisions[0].status, 'candidate');
  const retrieved = await store.retrieve('실비아가 왕이 되겠다고 약속했나?', { atTurn: 20 });
  assert.equal(retrieved.plan.hits.length, 0);
});

test('memory pipeline: 사용자 원문 인용은 그 인용문 자체만 승인한다', async () => {
  const store = createContinuityMemoryStore();
  const decisions = store.ingestTurn({
    turn: 3,
    sceneId: 'inn',
    userMessage: { id: 'm3u', content: '실비아, 다음 보름달 밤에 광장에서 만나자.' },
    assistantMessage: { id: 'm3a', content: '실비아가 생각해 보겠다고 답했다.' },
    candidates: [{
      kind: 'promise',
      text: '실비아가 만남을 확약했다',
      evidenceQuote: '다음 보름달 밤에 광장에서 만나자',
      entities: ['silvia'],
      knowledgeScope: 'user',
    }],
  });
  assert.equal(decisions[0].reason, 'user-quote');
  const record = store.list('approved')[0];
  assert.equal(record.text, '다음 보름달 밤에 광장에서 만나자');
  assert.equal(record.sourceMessageIds.includes('m3u'), true);
  assert.notEqual(record.text, '실비아가 만남을 확약했다');
});

test('memory pipeline: 성공한 엔진 사건만 승인하며 엔진 요약을 사실 문장으로 쓴다', () => {
  const store = createContinuityMemoryStore();
  const decisions = store.ingestTurn({
    turn: 7,
    userMessage: { id: 'm7u', content: '일급을 올린다.' },
    assistantMessage: { id: 'm7a', content: '실비아가 기뻐했다.' },
    candidates: [
      { kind: 'event', text: '실비아 일급이 올랐다', eventIds: ['set_wage'], entities: ['silvia'] },
      { kind: 'event', text: '금고가 백만 원 늘었다', eventIds: ['gold_delta'] },
    ],
    events: [
      { id: 'set_wage', index: 41, ok: true, summary: 'silvia 일급 5,000원→10,000원' },
      { id: 'gold_delta', index: 42, ok: false, summary: 'gold_delta 실패' },
    ],
  });
  assert.deepEqual(decisions.map((item) => item.status), ['approved', 'candidate']);
  const approved = store.list('approved')[0];
  assert.equal(approved.text, 'silvia 일급 5,000원→10,000원');
  assert.deepEqual(approved.sourceEventIndexes, [41]);
});

test('memory pipeline: 후보는 사용자 승인 후에만 회수된다', async () => {
  const store = createContinuityMemoryStore();
  const [decision] = store.ingestTurn({
    turn: 5,
    userMessage: { id: 'm5u', content: '이야기를 계속한다.' },
    assistantMessage: { id: 'm5a', content: '실비아가 자신의 과거를 털어놓았다.' },
    candidates: [{ kind: 'secret', text: '실비아는 왕실 경비대 출신이다', entities: ['silvia'], knowledgeScope: 'user' }],
  });
  assert.equal((await store.retrieve('실비아의 과거는?', { atTurn: 6 })).plan.hits.length, 0);
  store.approve(decision.recordId, 6);
  const result = await store.retrieve('실비아는 왕실 경비대 출신인가?', { atTurn: 7 });
  assert.equal(result.plan.hits[0]?.recordId, decision.recordId);
});

test('memory pipeline: 비밀은 허용된 관찰자에게만 보인다', async () => {
  const store = createContinuityMemoryStore();
  const [decision] = store.ingestTurn({
    turn: 1,
    userMessage: { id: 'u', content: '계속' },
    assistantMessage: { id: 'a', content: '비밀' },
    candidates: [{ kind: 'secret', text: '금고 열쇠는 화분 아래 있다', knowledgeScope: 'entity:silvia', entities: ['silvia'] }],
  });
  store.approve(decision.recordId, 1);
  const owner = await store.retrieve('금고 열쇠는 어디 있지?', { atTurn: 2, viewerScopes: ['public', 'user'], viewerEntityIds: ['user'] });
  assert.equal(owner.plan.hits.length, 0);
  const silvia = await store.retrieve('금고 열쇠는 어디 있지?', { atTurn: 2, viewerScopes: ['public', 'entity:silvia'], viewerEntityIds: ['silvia'] });
  assert.equal(silvia.plan.hits[0]?.recordId, decision.recordId);
});

test('memory pipeline: 저장 왕복 뒤 id 순서와 검색 근거가 보존된다', async () => {
  const store = createContinuityMemoryStore();
  store.ingestTurn({
    turn: 2,
    userMessage: { id: 'm2u', content: '삶은 달걀 가격은 오천 원으로 하자.' },
    assistantMessage: { id: 'm2a', content: '가격표를 바꿨다.' },
    candidates: [{ kind: 'episode', text: '가격 합의', evidenceQuote: '삶은 달걀 가격은 오천 원으로 하자', entities: ['owner'] }],
  });
  const restored = restoreContinuityMemoryStore(store.toJSON());
  const result = await restored.retrieve('삶은 달걀 가격은?', { atTurn: 3 });
  const text = formatGroundedMemory(result.plan, result.records);
  assert.match(text, /message:m2u/);
  assert.match(text, /삶은 달걀 가격은 오천 원/);
  const next = restored.ingestTurn({ turn: 4, candidates: [{ text: '검토 후보' }] });
  assert.equal(next[0].recordId, 'memory-000002');
});

test('memory pipeline: 같은 NPC가 나와도 없었던 사건의 핵심 표현이 없으면 회상을 포기한다', async () => {
  const store = createContinuityMemoryStore();
  store.ingestTurn({
    turn: 1,
    userMessage: { id: 'u1', content: '실비아와 다음 보름달에 광장에서 만나자.' },
    assistantMessage: { id: 'a1', content: '실비아가 고개를 끄덕였다.' },
    candidates: [{ kind: 'promise', text: '만남', evidenceQuote: '실비아와 다음 보름달에 광장에서 만나자', entities: ['silvia'] }],
  });
  const result = await store.retrieve('실비아가 왕이 되겠다고 선언했었나?', { atTurn: 20 });
  assert.equal(result.plan.abstained, true);
  assert.equal(result.plan.hits.length, 0);
});

test('memory pipeline: 손상된 기억 레코드는 세션 복구 전에 거부한다', () => {
  assert.throws(() => restoreContinuityMemoryStore({
    contract: 'continuity-memory/0.1', nextId: 2,
    records: [{ id: 'bad', text: 7, status: 'approved' }],
  }), /continuity_memory_record_invalid/);
});

test('memory pipeline: factRefs는 실제 사용자 메시지와 성공한 사건만 근거로 인정한다', () => {
  const verdicts = validateFactReferences([
    { claim: '사용자가 약속을 제안했다', refs: ['user-message'] },
    { claim: '일급이 변경됐다', refs: ['event:set_wage', 'state'] },
    { claim: '골드가 늘었다', refs: ['event:gold_delta'] },
    { claim: '출처가 있다', refs: ['unknown'] },
  ], {
    hasState: true,
    userMessageId: 'm1',
    events: [
      { id: 'set_wage', index: 1, ok: true, summary: '변경' },
      { id: 'gold_delta', index: 2, ok: false, summary: '실패' },
    ],
  });
  assert.deepEqual(verdicts.map((item) => item.ok), [true, true, false, false]);
  assert.deepEqual(verdicts[2].invalidRefs, ['event:gold_delta']);
});

test('memory pipeline: 300턴 뒤에도 초반 약속을 근거와 함께 회수하고 주입 크기는 상한 안에 머문다', async () => {
  const build = async () => {
    const store = createContinuityMemoryStore();
    for (let turn = 1; turn <= 300; turn += 1) {
      const quote = turn === 3
        ? '실비아와 붉은 보름달이 뜨는 밤 북문에서 만나자'
        : `일상 기록 ${turn}번은 창고 점검 항목 ${turn}이다`;
      store.ingestTurn({
        turn,
        sceneId: turn % 2 ? 'inn' : 'market',
        userMessage: { id: `u${turn}`, content: quote },
        assistantMessage: { id: `a${turn}`, content: `응답 ${turn}` },
        candidates: [{ kind: turn === 3 ? 'promise' : 'episode', text: quote, evidenceQuote: quote, entities: turn === 3 ? ['silvia'] : [] }],
      });
    }
    const result = await store.retrieve('붉은 보름달이 뜨는 밤 실비아와 어디서 만나기로 했지?', { atTurn: 300, sceneId: 'market', topK: 8 });
    return { json: store.toJSON(), result, text: formatGroundedMemory(result.plan, result.records) };
  };
  const first = await build();
  const second = await build();
  assert.match(first.text, /message:u3/);
  assert.match(first.text, /북문에서 만나자/);
  assert.ok(first.result.plan.hits.length <= 8);
  assert.ok(first.text.length < 4000, `기억 주입이 너무 큼: ${first.text.length}자`);
  assert.deepEqual(first.json, second.json, '같은 300턴 입력은 같은 기억 원장을 만든다');
  assert.deepEqual(first.result.plan.hits.map((hit) => hit.recordId), second.result.plan.hits.map((hit) => hit.recordId));
});

test('memory pipeline: 되돌리기로 원문과 사건 근거가 모두 사라지면 파생 기억도 폐기된다', async () => {
  const store = createContinuityMemoryStore();
  store.ingestTurn({
    turn: 2,
    userMessage: { id: 'u2', content: '실비아 일급을 만 원으로 올린다' },
    assistantMessage: { id: 'a2', content: '일급이 변경됐다' },
    candidates: [{ kind: 'event', text: '일급 변경', eventIds: ['set_wage'], entities: ['silvia'] }],
    events: [{ id: 'set_wage', index: 9, ok: true, summary: 'silvia 일급 5,000원→10,000원' }],
  });
  assert.equal(store.list('approved').length, 1);
  assert.deepEqual(store.reconcileSources({ messageIds: [], eventIndexes: [], atTurn: 3 }), ['memory-000001']);
  assert.equal(store.list('superseded').length, 1);
  const result = await store.retrieve('실비아 일급은 만 원인가?', { atTurn: 4 });
  assert.equal(result.plan.hits.length, 0);
});

test('memory pipeline: continuityPatch는 제안만 저장되고 사용자 승인 뒤에만 확정·해결된다', () => {
  const store = createContinuityMemoryStore();
  const [candidate] = store.ingestTurn({ turn: 1, assistantMessage: { id: 'a1', content: '제안' }, candidates: [{ kind: 'promise', text: '북문에서 만나기로 했다' }] });
  const [approved] = store.ingestTurn({ turn: 2, userMessage: { id: 'u2', content: '창고 열쇠는 내가 보관한다' }, candidates: [{ kind: 'episode', text: '열쇠 보관', evidenceQuote: '창고 열쇠는 내가 보관한다' }] });
  const patch = store.proposePatch({ confirmMemoryIds: [candidate.recordId], resolveMemoryIds: [approved.recordId], reason: '검토 완료' }, 3);
  assert.ok(patch);
  assert.equal(store.list().find((record) => record.id === candidate.recordId)?.status, 'candidate');
  assert.equal(store.list().find((record) => record.id === approved.recordId)?.status, 'approved');
  store.applyPatch(patch!.id, 3);
  assert.equal(store.list().find((record) => record.id === candidate.recordId)?.status, 'approved');
  const resolved = store.list().find((record) => record.id === approved.recordId)!;
  assert.equal(resolved.status, 'superseded');
  assert.equal(resolved.lifecycle?.state, 'resolved');
});

test('memory pipeline: 과거 성공 사건이 쌓여도 전부 현재 사실로 상시 주입되지 않는다', async () => {
  const store = createContinuityMemoryStore();
  for (let turn = 1; turn <= 300; turn += 1) {
    store.ingestTurn({
      turn,
      assistantMessage: { id: `a${turn}`, content: '처리됨' },
      candidates: [{ kind: 'event', text: `구매 ${turn}`, eventIds: ['purchase'] }],
      events: [{ id: 'purchase', index: turn, ok: true, summary: `식자재 구매 기록 ${turn}` }],
    });
  }
  const result = await store.retrieve('식자재 구매 기록 299', { atTurn: 300, topK: 8 });
  assert.equal(result.plan.currentFacts.length, 0, '과거 사건 원장은 엔진 현재 상태 블록이 아니다');
  assert.ok(result.plan.hits.length <= 8);
});
