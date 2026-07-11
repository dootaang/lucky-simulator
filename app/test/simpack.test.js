'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSimPack, packSimPack, unpackSimPack, migrateSimPack, sha256Hex } = require('../core/simpack/simpack.js');
const { selectSimPackRuntime } = require('../core/simpack/runtimeProject.js');

function sample() {
  const sourceBytes = new TextEncoder().encode('{"card":"opaque"}');
  return createSimPack({
    id: 'alternate-hunters-v2', title: 'Alternate Hunters V2', fileName: 'hunters.charx', sourceFormat: 'charx', sourceVersion: '3.0', sourceBytes,
    personas: [{ contract: 'persona/0.1', id: 'hunter', name: '헌터', prompt: '각성자', icon: '', note: '', embeddedModule: null, source: null, version: 1 }], defaultPersonaId: 'hunter',
    promptPresets: [{ contract: 'prompt-preset/0.1', id: 'p', name: 'P', compatibilityMode: 'simpack', version: 2, blocks: [], settings: { assistantPrefill: '', sendNames: false, sendChatAsSystem: false }, raw: null }], defaultPresetId: 'p',
    moduleBindings: [{ id: 'combat', name: 'Combat', namespace: 'combat', scope: 'character', lowLevelAccess: false, capabilities: ['combat'], provenance: { source: 'user', path: '$.modules' } }],
    installedModules: [{ id: 'combat.turnbased', version: '1.0.0', enabled: true }],
    characters: [{ id: 'iris', name: '아이리스' }], lorebooks: [{ entries: [] }], locations: [{ id: 'guild' }], items: [{ id: 'potion' }],
    schema: { meta: { id: 'hunters' }, initialState: { day: 1 } },
    screens: [{ id: 'field', title: '현장', layout: 'stage-chat-hud', regions: [] }], navigation: [{ id: 'field', screenId: 'field', label: '현장' }],
    assets: [{ id: 'iris-default', name: '아이리스', kind: 'emotion', blob: null, canonical: { entityId: 'iris', emotion: 'default' }, source: null }],
    featureToggles: { combat: true }, evidence: [{ path: '$.runtime.schema', confidence: 1, refs: [{ source: 'user', path: '$' }] }],
    conflicts: [{ path: '$.content.locations', choices: ['guild', 'gate'], resolution: 'guild' }], unsupported: [{ id: 'lua', status: 'blocked' }],
  });
}

test('SimPack blob hash는 표준 SHA-256이다', () => {
  assert.equal(sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('SimPack v0.2는 모든 제작 영역과 원본 blob을 한 파일로 왕복한다', () => {
  const project = sample();
  const bytes = packSimPack(project);
  const restored = unpackSimPack(bytes);
  assert.equal(restored.manifest.contract, 'simpack/0.2');
  assert.equal(restored.manifest.personas.library[0].name, '헌터');
  assert.equal(restored.manifest.prompts.presets[0].version, 2);
  assert.equal(restored.manifest.modules.installed[0].id, 'combat.turnbased');
  assert.equal(restored.manifest.runtime.screens[0].id, 'field');
  assert.equal(restored.manifest.assets[0].canonical.entityId, 'iris');
  assert.equal(restored.manifest.compatibility.conflicts[0].resolution, 'guild');
  assert.deepEqual(restored.files[restored.manifest.source.card.blob.path], new TextEncoder().encode('{"card":"opaque"}'));
  const editorModel = selectSimPackRuntime(restored.manifest);
  const playerModel = selectSimPackRuntime(restored.manifest);
  assert.deepEqual(editorModel, playerModel, '편집기와 플레이어는 동일한 프로젝트 선택기를 사용한다');
});

test('SimPack은 경로 탈출과 blob 변조를 가져오기 전에 거부한다', () => {
  const project = sample();
  assert.throws(() => packSimPack({ manifest: project.manifest, files: { '../evil': Uint8Array.of(1) } }), /unsafe_path/);
  const bytes = packSimPack(project);
  const { unzipSync, zipSync } = require('fflate');
  const archive = unzipSync(bytes);
  const sourcePath = project.manifest.source.card.blob.path;
  archive[sourcePath] = Uint8Array.of(9);
  assert.throws(() => unpackSimPack(zipSync(archive)), /blob_mismatch/);
});

test('SimPack v0.1 flat 문서는 명시적 migration history와 함께 v0.2로 올라간다', () => {
  const migrated = migrateSimPack({ contract: 'simpack/0.1', id: 'old', title: 'Old', schema: { meta: { id: 'old' } }, characters: [{ id: 'c' }], screens: [] });
  assert.equal(migrated.contract, 'simpack/0.2');
  assert.deepEqual(migrated.migrations.history, [{ from: 1, to: 2, note: 'Normalized legacy flat project sections.' }]);
  assert.equal(migrated.runtime.schema.meta.id, 'old');
});
