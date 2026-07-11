'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compilePrompt } = require('../core/prompt/compilePrompt.js');
const { normalizePromptPreset, createDefaultPreset } = require('../core/prompt/presetFactory.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'prompt-parity');

function buildPreset(fixture) {
  const preset = createDefaultPreset({ compatibilityMode: fixture.presetKind === 'simpack' ? 'simpack' : 'risu' });
  const overrides = fixture.presetOverrides || {};
  if (typeof overrides.mainText === 'string') preset.blocks.find((block) => block.id === 'main').text = overrides.mainText;
  if (Number.isFinite(overrides.chatRangeStart)) preset.blocks.find((block) => block.id === 'chat').rangeStart = overrides.chatRangeStart;
  if (typeof overrides.assistantPrefill === 'string') preset.settings.assistantPrefill = overrides.assistantPrefill;
  // 기본 프리셋은 정규화기를 이슈 없이 통과해야 한다 — 팩토리와 정규화기의 계약 동기화 검증.
  const { preset: normalized, issues } = normalizePromptPreset(preset);
  assert.deepEqual(issues, []);
  return normalized;
}

for (const file of fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
  test(`golden ${file}: ${fixture.name}`, () => {
    const result = compilePrompt({ preset: buildPreset(fixture), ...fixture.input });
    assert.deepEqual(result.messages, fixture.expected.messages);
    assert.equal(result.assistantPrefill, fixture.expected.assistantPrefill);
    assert.deepEqual(
      result.warnings.map(({ code, detail }) => ({ code, detail })),
      fixture.expected.warnings.map(({ code, detail }) => ({ code, detail })),
    );
    if (fixture.expected.traceSummary) {
      assert.deepEqual(
        result.trace.map(({ blockId, role, active, reason }) => ({ blockId, role, active, reason })),
        fixture.expected.traceSummary,
      );
    }
  });
}

test('simpack 강화는 additive — 엔진 블록을 뺀 메시지가 risu 모드와 바이트 동일', () => {
  const card = { name: '아린', description: '여관 주인.' };
  const risu = compilePrompt({ preset: createDefaultPreset(), card });
  const simpack = compilePrompt({
    preset: createDefaultPreset({ compatibilityMode: 'simpack' }),
    card,
    engineContext: { facts: '사실', availableActions: '행동', groundedMemory: '기억' },
  });
  const engineContents = new Set(['사실', '행동', '기억']);
  assert.deepEqual(simpack.messages.filter((message) => !engineContents.has(message.content)), risu.messages);
});

test('순수성 — 같은 입력이면 같은 출력이고 입력을 변이하지 않는다', () => {
  const input = {
    preset: createDefaultPreset(),
    card: { name: '아린', description: 'D.' },
    chat: [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }],
    authorNote: { content: 'AN', depth: 1 },
  };
  const snapshot = JSON.stringify(input);
  const first = compilePrompt(input);
  const second = compilePrompt(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);
});

test('authorNote depth는 마지막 chat 조각의 끝-깊이 위치에 주입되고 trace에 위치를 남긴다', () => {
  const result = compilePrompt({
    preset: createDefaultPreset(),
    card: { name: '아린', description: 'D.' },
    chat: [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'u2' }],
    authorNote: { content: 'AN', depth: 1 },
  });
  assert.deepEqual(result.messages.map((message) => message.content), ['D.', 'u1', 'a1', 'AN', 'u2']);
  const row = result.trace.find((entry) => entry.blockId === 'authornote');
  assert.equal(row.active, true);
  assert.equal(row.insertedAt, 'chat[-1]');
});

test('authorNote depth인데 주입할 대화가 없으면 블록 위치 출력 + 경고', () => {
  const result = compilePrompt({
    preset: createDefaultPreset(),
    card: { name: '아린', description: 'D.' },
    authorNote: { content: 'AN', depth: 2 },
  });
  assert.deepEqual(result.messages.map((message) => message.content), ['D.', 'AN']);
  assert.ok(result.warnings.some((warning) => warning.code === 'authornote_depth_fallback'));
});

test('chat range — -1000은 전체, start>=end는 empty_range로 비활성', () => {
  const chat = [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }];
  const full = createDefaultPreset();
  full.blocks.find((block) => block.id === 'chat').rangeStart = -1000;
  assert.equal(compilePrompt({ preset: full, card: { name: '아' }, chat }).messages.length, 2);

  const empty = createDefaultPreset();
  const chatBlock = empty.blocks.find((block) => block.id === 'chat');
  chatBlock.rangeStart = 5; chatBlock.rangeEnd = 2;
  const result = compilePrompt({ preset: empty, card: { name: '아' }, chat });
  assert.equal(result.messages.length, 0);
  assert.equal(result.trace.find((entry) => entry.blockId === 'chat').reason, 'empty_range');
});

test('sendChatAsSystem — Risu systemizeChat 고증: "role: content"로 승격', () => {
  const preset = createDefaultPreset();
  preset.settings.sendChatAsSystem = true;
  const result = compilePrompt({ preset, card: { name: '아' }, chat: [{ role: 'user', content: '안녕' }, { role: 'assistant', content: '응' }] });
  assert.deepEqual(result.messages, [
    { role: 'system', content: 'user: 안녕' },
    { role: 'system', content: 'assistant: 응' },
  ]);
});

test('postHistoryInstructions는 globalNote slot의 {{original}}로 병합된다', () => {
  const preset = createDefaultPreset();
  preset.blocks.find((block) => block.id === 'global-note').text = 'GN';
  const result = compilePrompt({ preset, card: { name: '아', postHistoryInstructions: '지시({{original}})' } });
  assert.deepEqual(result.messages, [{ role: 'system', content: '지시(GN)' }]);
});

test('mergeConsecutiveRoles 옵션 — 기본은 병합하지 않고, 켜면 같은 role을 합친다', () => {
  const input = { preset: createDefaultPreset(), card: { name: '아', description: 'D.', systemPrompt: 'S' } };
  assert.equal(compilePrompt(input).messages.length, 2);
  const merged = compilePrompt({ ...input, options: { mergeConsecutiveRoles: true } });
  assert.deepEqual(merged.messages, [{ role: 'system', content: 'S\n\nD.' }]);
});

test('engineContext가 있는데 받아줄 블록이 없으면 경고하고 원문 블록에 섞지 않는다', () => {
  const result = compilePrompt({
    preset: createDefaultPreset(),
    card: { name: '아', description: 'D.' },
    engineContext: { facts: '사실', availableActions: '행동', groundedMemory: '기억' },
  });
  assert.deepEqual(result.messages, [{ role: 'system', content: 'D.' }]);
  assert.equal(result.warnings.filter((warning) => warning.code === 'engine_block_missing').length, 3);
});

test('cache 블록은 실행하지 않고 trace에 unsupported로 남긴다', () => {
  const { preset } = normalizePromptPreset({
    blocks: [
      { id: 'c', type: 'cache', name: '캐시', depth: 2, role: 'all' },
      { id: 'description', type: 'description', name: '설명' },
    ],
  });
  const result = compilePrompt({ preset, card: { name: '아', description: 'D.' } });
  assert.equal(result.trace.find((entry) => entry.blockId === 'c').reason, 'unsupported');
  assert.deepEqual(result.messages, [{ role: 'system', content: 'D.' }]);
});

test('normalizePromptPreset — 관용 수용: 미지원 타입 제외·중복 id 접미사·역할 보정을 이슈로 보고', () => {
  const { preset, issues } = normalizePromptPreset({
    id: ' ',
    compatibilityMode: 'weird',
    blocks: [
      { id: 'a', type: 'plain', role: 'bot', text: 'T' },
      { id: 'a', type: 'description' },
      { id: 'x', type: 'lua-script' },
      'garbage',
      { id: 'chat', type: 'chat', rangeStart: '-8', rangeEnd: 'oops' },
    ],
  });
  assert.equal(preset.id, 'preset-unnamed');
  assert.equal(preset.compatibilityMode, 'risu');
  assert.deepEqual(preset.blocks.map((block) => block.id), ['a', 'a-1', 'chat']);
  assert.equal(preset.blocks[0].role, 'system');
  assert.equal(preset.blocks[0].slot, 'normal');
  assert.equal(preset.blocks[2].rangeStart, -8);
  assert.equal(preset.blocks[2].rangeEnd, 'end');
  assert.ok(issues.length >= 4);
  const nonObject = normalizePromptPreset(null);
  assert.equal(nonObject.preset.contract, 'prompt-preset/0.1');
  assert.ok(nonObject.issues.length >= 1);
});

test('정규화를 거치지 않은 프리셋(blocks 없음)은 명시적으로 거부한다', () => {
  assert.throws(() => compilePrompt({ preset: { settings: {} }, card: { name: '아' } }), TypeError);
});
