'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { parseCard } = require('../core/card/parseCard.js');
const { createRisuCompatibilityEnvelope } = require('../core/compat/risuCompatibility.js');
const { validateRisuCompatibilityEnvelope, validatePersona, validatePromptPreset } = require('../core/compat/schemas.js');

function card(overrides = {}) {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: '호환 시험 카드',
      description: '설명 {{getvar::route}}',
      personality: '차분함',
      scenario: '여관',
      first_mes: '시작',
      alternate_greetings: ['다른 시작'],
      system_prompt: '시스템',
      post_history_instructions: '마지막 지시',
      creator: 'tester',
      character_version: '1.2',
      tags: ['sim'],
      extensions: {
        risuai: {
          backgroundHTML: '<div>status</div>',
          futureField: { keep: true },
        },
      },
      assets: [],
      ...overrides,
    },
  };
}

test('compatibility envelope separates normalized data while retaining raw unknown fields and bytes', () => {
  const bytes = strToU8(JSON.stringify(card()));
  const parsed = parseCard(bytes, 'sample.json');
  const lore = { kind: 'card', bookName: '테스트', entries: [{ content: '{{setvar::x::1}}' }] };
  const envelope = createRisuCompatibilityEnvelope(parsed, lore);

  assert.equal(envelope.contract, 'risu-compatibility/0.1');
  assert.equal(envelope.normalized.character.name, '호환 시험 카드');
  assert.equal(envelope.raw.card.data.extensions.risuai.futureField.keep, true);
  assert.equal(envelope.raw.sourceBytes, bytes);
  assert.equal(envelope.raw.containerEntries[0].name, 'card.json');
  assert.ok(envelope.compatibility.features.some((item) => item.id === 'opaque-extensions' && item.status === 'preserved'));
  assert.ok(envelope.compatibility.features.some((item) => item.id === 'cbs' && item.status === 'preserved'));
  assert.deepEqual(validateRisuCompatibilityEnvelope(envelope), []);
});

test('charx inventory includes unknown files without eagerly decoding assets', () => {
  const bytes = zipSync({
    'card.json': strToU8(JSON.stringify(card())),
    'future/unknown.bin': Uint8Array.from([1, 2, 3, 4]),
    'notes/custom.txt': strToU8('preserve me'),
  });
  const parsed = parseCard(bytes, 'sample.charx', { lazy: true });
  const envelope = createRisuCompatibilityEnvelope(parsed, null);
  const names = envelope.raw.containerEntries.map((entry) => entry.name);

  assert.ok(names.includes('future/unknown.bin'));
  assert.ok(names.includes('notes/custom.txt'));
  assert.equal(envelope.raw.sourceBytes, bytes);
});

test('embedded module files are reported as preserved until detailed inspection', () => {
  const bytes = zipSync({
    'card.json': strToU8(JSON.stringify(card())),
    'module.risum': Uint8Array.from([0x6f, 0, 0, 0, 0, 0, 0]),
  });
  const parsed = parseCard(bytes, 'module-card.charx', { lazy: true });
  const envelope = createRisuCompatibilityEnvelope(parsed, null);
  const feature = envelope.compatibility.features.find((item) => item.id === 'embedded-modules');
  assert.equal(feature.status, 'preserved');
  assert.equal(feature.count, 1);
});

test('executable Risu module features are preserved but blocked', () => {
  const parsed = {
    format: 'risum', source: 'unsafe.risum', spec: 'risu-module', specVersion: 'risuModule',
    name: 'Unsafe', assets: [], card: { type: 'risuModule' },
    module: {
      id: 'unsafe', name: 'Unsafe', lowLevelAccess: true, cjs: 'doSomething()', mcp: { url: 'https://example.com' },
      trigger: [{ effect: [{ type: 'triggerlua', code: 'print(1)' }] }],
    },
    _sourceBytes: Uint8Array.from([0x6f]), containerEntries: [],
  };
  const envelope = createRisuCompatibilityEnvelope(parsed, null);
  const byId = Object.fromEntries(envelope.compatibility.features.map((item) => [item.id, item]));
  for (const id of ['triggers', 'lua', 'cjs', 'mcp', 'low-level']) assert.equal(byId[id].status, 'blocked');
  assert.equal(envelope.normalized.modules[0].lowLevelAccess, true);
});

test('persona and prompt preset contracts reject malformed data and accept minimum valid data', () => {
  const persona = {
    contract: 'persona/0.1', id: 'hero', name: '용사', prompt: '검사', icon: '', note: '', embeddedModule: null, source: null, version: 1,
  };
  const preset = {
    contract: 'prompt-preset/0.1', id: 'risu-default', name: 'Risu 기본', compatibilityMode: 'risu', version: 1,
    blocks: [{ id: 'persona', type: 'persona', name: '페르소나', enabled: true, source: null }],
    settings: { assistantPrefill: '', sendNames: true, sendChatAsSystem: false }, raw: null,
  };
  assert.deepEqual(validatePersona(persona), []);
  assert.deepEqual(validatePromptPreset(preset), []);
  assert.ok(validatePersona({ contract: 'wrong' }).length > 0);
  assert.ok(validatePromptPreset({ contract: 'wrong', blocks: [] }).length > 0);
});
