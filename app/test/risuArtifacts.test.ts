import assert from 'node:assert/strict';
import test from 'node:test';

import { exportRisuPersonaPng, importRisuPersonaPng } from '../core/compat/personaPng';
import { exportRisuPreset, importRisuPreset } from '../core/compat/risuPreset';
import type { Persona, PromptPreset } from '../core/compat/contracts';

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

test('Risu persona PNG는 이름·프롬프트·메모와 아이콘을 왕복한다', () => {
  const persona: Persona = {
    contract: 'persona/0.1', id: 'hero', name: '주인장', prompt: '나는 여관 주인이다.',
    icon: '', note: '테스트 메모', embeddedModule: null, source: null, version: 3,
  };
  const exported = exportRisuPersonaPng(persona, ONE_PIXEL_PNG);
  const imported = importRisuPersonaPng(exported, 'hero.png');
  assert.equal(imported.name, persona.name);
  assert.equal(imported.prompt, persona.prompt);
  assert.equal(imported.note, persona.note);
  assert.match(imported.icon, /^data:image\/png;base64,/);
  assert.deepEqual(exportRisuPersonaPng(imported), exported);
});

test('Risu .risup은 PromptItem 의미와 알려지지 않은 preset 필드를 보존한다', async () => {
  const raw = {
    name: '호환 프리셋', temperature: 87, futureRisuField: { untouched: true }, assistantPrefill: '계속:',
    sendChatAsSystem: true, sendName: true,
    promptTemplate: [
      { type: 'plain', type2: 'main', role: 'system', text: 'MAIN', name: 'main' },
      { type: 'description', role2: 'bot', innerFormat: '[{{slot}}]' },
      { type: 'chat', rangeStart: -8, rangeEnd: 'end' },
      { type: 'cache', name: 'cache', depth: 4, role: 'all' },
    ],
  };
  const preset: PromptPreset = {
    contract: 'prompt-preset/0.1', id: 'p', name: raw.name, compatibilityMode: 'risu', version: 1,
    blocks: [], settings: { assistantPrefill: raw.assistantPrefill, sendNames: true, sendChatAsSystem: true }, raw,
  };
  // First encode the raw preset, then import it as a real Risu file.
  const initial = await exportRisuPreset({ ...preset, blocks: [
    { id: 'm', type: 'plain', name: 'main', enabled: true, role: 'system', text: 'MAIN', slot: 'main', source: null },
    { id: 'd', type: 'description', name: 'description', enabled: true, role: 'assistant', innerFormat: '[{{slot}}]', source: null },
    { id: 'c', type: 'chat', name: 'chat', enabled: true, rangeStart: -8, rangeEnd: 'end', source: null },
    { id: 'x', type: 'cache', name: 'cache', enabled: true, depth: 4, role: 'all', source: null },
  ] });
  const first = await importRisuPreset(initial, 'sample.risup');
  assert.equal(first.preset.blocks[0].type, 'plain');
  assert.equal(first.preset.blocks[1].type, 'description');
  assert.equal((first.preset.blocks[1] as any).role, 'assistant');
  assert.equal(first.preset.settings.assistantPrefill, '계속:');
  assert.deepEqual(first.rawPreset.futureRisuField, { untouched: true });

  const secondBytes = await exportRisuPreset(first.preset);
  const second = await importRisuPreset(secondBytes, 'sample.risup');
  assert.deepEqual(second.rawPreset.futureRisuField, { untouched: true });
  assert.equal(second.rawPreset.temperature, 87);
  assert.deepEqual(second.preset.blocks.map((block) => block.type), ['plain', 'description', 'chat', 'cache']);
});

