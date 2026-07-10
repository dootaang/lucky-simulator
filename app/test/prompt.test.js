'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const innSchema = require('../../schema/yongsa-inn.v0.json');
const hunterSchema = require('../../schema/hunters-combat.v0.json');
const { createState } = require('../../engine/core/createState.js');
const { summarize } = require('../../engine/core/selectors.js');
const { buildSystemPrompt, formatEngineVerdicts, buildPrompt, buildNarrationPrompt, parseAssistantResponse } = require('../src/llm/prompt.js');
const { validateSchema } = require('../src/schema/validate.js');

test('inn system prompt keeps its identity and all inn event vocabulary', () => {
  const system = buildSystemPrompt(innSchema);
  assert.match(system, /"용사여관"의 내레이터/);
  assert.match(system, /\bsale\b/);
  assert.match(system, /\bcheckin\b/);
  assert.doesNotMatch(system, /\bcombat_action\b/);
});

test('hunter system prompt is combat-specific and contains no inn vocabulary', () => {
  const system = buildSystemPrompt(hunterSchema);
  assert.match(system, /"헌터 전투 코어 \(참조 스키마\)"의 내레이터/);
  for (const word of ['용사여관', '여관', 'sale', 'checkin', 'upgrade', 'hire']) assert.doesNotMatch(system, new RegExp(word));
  for (const phrase of [
    'start_encounter를 절대 다시 내지 마라',
    '모든 적이 "전투불능"으로 표시된 다음에야 end_encounter를 내라',
    '반드시 combat_action 사건을 내라',
  ]) assert.ok(system.includes(phrase));
});

test('formatEngineVerdicts formats failures, successes, and empty input', () => {
  const text = formatEngineVerdicts([{ ok: false, text: 'start_encounter 실패' }, { ok: true, text: '공격 처리' }]);
  assert.match(text, /❌ start_encounter 실패.*무효/);
  assert.match(text, /✅ 공격 처리/);
  assert.equal(formatEngineVerdicts([]), '');
});

test('buildPrompt injects optional engine verdicts immediately after state', () => {
  const base = { schema: hunterSchema, state: createState(hunterSchema), recentMessages: [], userInput: '공격한다' };
  const withVerdicts = buildPrompt({ ...base, lastVerdicts: [{ ok: false, text: '거부됨' }] });
  const context = withVerdicts.messages.at(-1).content;
  assert.ok(context.indexOf('[엔진 판정') > context.indexOf('[상태]'));
  assert.match(context, /무효/);
  assert.ok(withVerdicts.injectedParts.verdicts > 0);
  assert.doesNotMatch(buildPrompt(base).messages.at(-1).content, /\[엔진 판정/);
});

test('summarize omits inn lines for hunter and preserves inn golden bytes', () => {
  const hunterSummary = summarize(hunterSchema, createState(hunterSchema));
  assert.doesNotMatch(hunterSummary, /\[여관\]/);
  assert.equal(summarize(innSchema, createState(innSchema)), [
    '[여관] 1일차 · 골드 500,000원 · 식자재 20인분 · 주류 20잔 · 시설 주점1/주방1/객실1/숙소1',
    '[직원] 없음',
    '[객실] 전 객실 공실',
    '[평판] 마을 E(0) · 모험가 길드 E(0) · 마법사 길드 E(0) · 귀족·왕실 E(0) · 뒷세계 E(0) · 상인 조합 E(0)',
  ].join('\n'));
});

test('parseAssistantResponse drops events without a non-empty string id', () => {
  const parsed = parseAssistantResponse('서사\n```json\n{"events":[{"params":{}},{"id":"","params":{}},{"id":"combat_action","params":{"action":"attack"}}]}\n```');
  assert.equal(parsed.dropped, 2);
  assert.deepEqual(parsed.events, [{ id: 'combat_action', params: { action: 'attack' } }]);
});

test('buildPrompt enables all combat vocabulary after scales are promoted', () => {
  const source = {
    meta: { id: 'promoted', title: '승격 전투', schemaVersion: '0.1' }, resources: [],
    scales: [{ id: 'HP', owner: 'player', range: [0, 100], default: 80 }], ladders: [], entities: [], events: [],
  };
  const schema = validateSchema(source).schema;
  const prompt = buildPrompt({ schema, state: createState(schema), recentMessages: [], userInput: '싸운다' });
  for (const id of ['start_encounter', 'combat_action', 'enemy_action', 'end_encounter']) assert.match(prompt.system, new RegExp(id));
});

test('buildNarrationPrompt fixes engine results and includes flavor text', () => {
  const prompt = buildNarrationPrompt({ schema: hunterSchema, state: createState(hunterSchema), results: ['공격 · e1 명중 · 피해 12'], flavorText: '낮게 파고든다', recentMessages: [] });
  assert.match(prompt.system, /새 사건 JSON을 내지 마라/);
  assert.match(prompt.messages.at(-1).content, /\[확정된 전투 결과\]/);
  assert.match(prompt.messages.at(-1).content, /공격 · e1 명중 · 피해 12/);
  assert.match(prompt.messages.at(-1).content, /플레이어의 연출 의도: 낮게 파고든다/);
});

test('buildNarrationPrompt adds chronological whole-combat instruction only for long result lists', () => {
  const base = { schema: hunterSchema, state: createState(hunterSchema), flavorText: '', recentMessages: [] };
  assert.doesNotMatch(buildNarrationPrompt({ ...base, results: Array(8).fill('결과') }).messages.at(-1).content, /여러 턴의 전투 전체/);
  assert.match(buildNarrationPrompt({ ...base, results: Array(9).fill('결과') }).messages.at(-1).content, /여러 턴의 전투 전체를 시간순으로 요약/);
});

test('consumables inject vocabulary and stocked item list while inn stays unchanged', () => {
  const state = createState(hunterSchema);
  const prompt = buildPrompt({ schema: hunterSchema, state, recentMessages: [], userInput: '포션을 쓴다' });
  assert.match(prompt.system, /use_item \{itemId\}/);
  assert.match(prompt.messages.at(-1).content, /\[소모품 목록\]/);
  assert.match(prompt.messages.at(-1).content, /health_potion: 체력 포션 ×3 \(\+40 HP\)/);
  assert.ok(prompt.injectedParts.items > 0);
  assert.doesNotMatch(buildSystemPrompt(innSchema), /use_item/);
  assert.doesNotMatch(buildPrompt({ schema: innSchema, state: createState(innSchema), recentMessages: [], userInput: '쉰다' }).messages.at(-1).content, /\[소모품 목록\]/);
});
