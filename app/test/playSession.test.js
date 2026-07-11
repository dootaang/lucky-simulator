'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../../schema/yongsa-inn.v0.json');
const { createSessionJournal, restoreSessionJournal } = require('../../engine/core/sessionJournal.js');
const { buildPlaySessionExport, parsePlaySessionImport, PLAY_SESSION_CONTRACT } = require('../core/session/playSession.js');

function playedJournal() {
  const journal = createSessionJournal(schema, 7);
  journal.append({ id: 'gold_delta', params: { amount: 500, reason: '테스트' } });
  journal.append({ id: 'purchase', params: { resource: 'food', qty: 2 } });
  journal.append({ id: 'day_end', params: {} });
  return journal;
}

test('내보내기 → 파싱 → 원장 복구까지 전 계층 왕복이 성립한다', () => {
  const journal = playedJournal();
  const payload = buildPlaySessionExport({
    journal: journal.toJSON(),
    messages: [
      { role: 'user', content: '식자재 사자' },
      { role: 'assistant', content: '사왔다.', chips: [{ ok: true, kind: 'resource', text: '구매' }], npcIds: ['silvia'] },
      { role: 'ledger', content: '', chips: [{ ok: true, kind: 'settlement', text: '마감' }] },
    ],
    promptRuns: [{ promptHash: 'h1', model: 'gemini-2.5-flash', responseText: '사왔다.', proposedEvents: ['purchase'], appliedOk: 1 }],
    savedAt: 1760000000000,
    title: '여관 1일차',
  });
  const reparsed = parsePlaySessionImport(JSON.stringify(payload));
  assert.equal(reparsed.contract, PLAY_SESSION_CONTRACT);
  assert.equal(reparsed.title, '여관 1일차');
  assert.equal(reparsed.messages.length, 3);
  assert.deepEqual(reparsed.promptRuns[0], { index: 1, promptHash: 'h1', model: 'gemini-2.5-flash', responseText: '사왔다.', proposedEvents: ['purchase'], appliedOk: 1 });

  const restored = restoreSessionJournal(schema, reparsed.journal);
  assert.deepEqual(restored.head(), journal.head());
  assert.deepEqual(restored.state, journal.state);
});

test('오염된 메시지·PromptRun은 정제되고 형식 위반은 거부된다', () => {
  const journal = playedJournal();
  const payload = buildPlaySessionExport({
    journal: journal.toJSON(),
    messages: [
      { role: 'user', content: '정상' },
      { role: 'system', content: '허용 안 되는 role' },
      'garbage',
      { role: 'assistant', content: 123, chips: 'not-array' },
    ],
    promptRuns: [null, { promptHash: 1, model: null, proposedEvents: 'x' }],
    savedAt: 'not-a-number',
  });
  assert.equal(payload.savedAt, 0);
  assert.deepEqual(payload.messages.map((message) => message.role), ['user', 'assistant']);
  assert.equal(payload.messages[1].content, '123');
  assert.equal(Object.hasOwn(payload.messages[1], 'chips'), false);
  assert.deepEqual(payload.promptRuns, [{ index: 1, promptHash: '1', model: '', responseText: '', proposedEvents: [], appliedOk: 0 }]);

  assert.throws(() => parsePlaySessionImport('not json'), /play_session_not_json/);
  assert.throws(() => parsePlaySessionImport('{"contract":"nope"}'), /play_session_contract_mismatch/);
  assert.throws(() => parsePlaySessionImport(JSON.stringify({ contract: PLAY_SESSION_CONTRACT })), /play_session_journal_missing/);
  assert.throws(() => buildPlaySessionExport({ journal: { contract: 'nope' } }), /play_session_journal_required/);
});

test('사건 수가 상한을 넘는 거대 파일은 재생 전에 거부된다 (탭 프리즈 방지)', () => {
  const journal = playedJournal();
  const payload = buildPlaySessionExport({ journal: journal.toJSON(), messages: [], promptRuns: [], savedAt: 1 });
  payload.journal.events = new Array(50001).fill({ index: 1, event: { id: 'gold_delta', params: { amount: 1 } }, ok: true });
  assert.throws(() => parsePlaySessionImport(JSON.stringify(payload)), /play_session_too_large/);
});

test('다른 스키마의 세션은 원장 복구 단계에서 지문 불일치로 거부된다', () => {
  const journal = playedJournal();
  const payload = buildPlaySessionExport({ journal: journal.toJSON(), messages: [], promptRuns: [], savedAt: 1 });
  const otherSchema = JSON.parse(JSON.stringify(schema));
  otherSchema.__other = true;
  assert.throws(() => restoreSessionJournal(otherSchema, parsePlaySessionImport(JSON.stringify(payload)).journal), /journal_schema_mismatch/);
});

test('세션 파일은 메시지 근거 id, 기억 원장, 기억 판정 trace를 함께 보존한다', () => {
  const journal = createSessionJournal(schema, 42);
  const memory = {
    contract: 'continuity-memory/0.1', nextId: 2,
    records: [{ id: 'memory-000001', text: '다음 보름달에 만나자', status: 'approved' }],
    nextPatchId: 2,
    patches: [{ id: 'continuity-patch-000001', turn: 2, confirmMemoryIds: [], resolveMemoryIds: ['memory-000001'], reason: '이행', status: 'pending' }],
  };
  const payload = buildPlaySessionExport({
    journal: journal.toJSON(),
    messages: [{ id: 'message-1', role: 'user', content: '약속하자', sceneId: 'inn' }],
    promptRuns: [{
      promptHash: 'h', model: 'm', responseText: '응답', proposedEvents: [], appliedOk: 0,
      proposedMemory: [{ kind: 'promise', text: '약속' }],
      memoryDecisions: [{ recordId: 'memory-000001', status: 'approved', reason: 'user-quote' }],
      factRefs: [{ claim: '약속을 제안했다', refs: ['user-message'] }],
      factRefVerdicts: [{ claim: '약속을 제안했다', refs: ['user-message'], ok: true, invalidRefs: [] }],
    }],
    memory, savedAt: 1,
  });
  const restored = parsePlaySessionImport(JSON.stringify(payload));
  assert.equal(restored.messages[0].id, 'message-1');
  assert.equal(restored.messages[0].sceneId, 'inn');
  assert.equal(restored.memory.records[0].id, 'memory-000001');
  assert.equal(restored.memory.patches[0].resolveMemoryIds[0], 'memory-000001');
  assert.equal(restored.promptRuns[0].memoryDecisions[0].reason, 'user-quote');
  assert.deepEqual(restored.promptRuns[0].factRefs[0].refs, ['user-message']);
  assert.equal(restored.promptRuns[0].factRefVerdicts[0].ok, true);
});

test('페르소나와 프롬프트 프리셋은 시작 시점 스냅샷으로 세션에 고정된다', () => {
  const journal = createSessionJournal(schema, 42);
  const persona = { contract: 'persona/0.1', id: 'owner', name: '주인장', prompt: '나는 여관 주인이다.', icon: '', note: '', embeddedModule: null, source: null, version: 2 };
  const preset = { contract: 'prompt-preset/0.1', id: 'risu', name: 'Risu', compatibilityMode: 'risu', version: 4, blocks: [], settings: { assistantPrefill: '', sendNames: false, sendChatAsSystem: false }, raw: null };
  const payload = buildPlaySessionExport({
    journal: journal.toJSON(), messages: [], promptRuns: [], savedAt: 1,
    personaBinding: { boundPersonaId: persona.id, snapshot: persona },
    promptPresetBinding: { id: preset.id, version: preset.version, hash: 'preset-hash', snapshot: preset },
  });
  // 라이브 라이브러리 객체가 이후 편집돼도 저장된 시작 스냅샷은 변하지 않는다.
  persona.prompt = '나중에 바꾼 설명';
  preset.name = '나중에 바꾼 이름';
  const restored = parsePlaySessionImport(JSON.stringify(payload));
  assert.equal(restored.personaBinding.snapshot.prompt, '나는 여관 주인이다.');
  assert.equal(restored.promptPresetBinding.snapshot.name, 'Risu');
  assert.equal(restored.promptPresetBinding.hash, 'preset-hash');
});
