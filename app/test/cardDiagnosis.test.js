'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnoseCard, summarizeAssets } = require('../src/llm/cardDiagnosis.js');

function parsedCard(overrides = {}) {
  return {
    format: 'charx',
    source: 'sample.charx',
    assets: [
      { name: 'Hero angry', mime: 'image/png' },
      { name: 'Hero_happy', mime: 'image/png' },
      { name: 'village&night', mime: 'image/png' },
    ],
    card: {
      spec: 'chara_card_v3',
      data: {
        name: 'Sample RPG',
        description: 'A guild quest and combat RPG with party equipment.',
        first_mes: 'Start',
        alternate_greetings: ['Gate start'],
        post_history_instructions: '{{getvar::mode}}',
        extensions: { risuai: { backgroundHTML: '<div>panel</div>' } },
        ...overrides,
      },
    },
  };
}

function mined(overrides = {}) {
  return {
    archetype: 'prose',
    luaSize: 100,
    cardLuaSize: 0,
    moduleSummary: { name: 'Sample module', triggerCount: 1, regexCount: 2, loreCount: 0, assetCount: 0, effectTypes: { triggerlua: 1 } },
    cardScriptSummary: { luaEffects: 0, luaChars: 0, defaultVariableLines: 2 },
    defaultVars: { numbers: { mode: 1, economy: 0 }, numericCount: 2, totalLines: 2 },
    ...overrides,
  };
}

test('diagnosis reports scripts, feature flags, capabilities, assets, and compiler coverage', () => {
  const lore = { entries: [
    { name: 'Combat', content: 'HP battle rules and weapons', constant: true },
    { name: 'Quest', content: 'Mission reward and inventory item', constant: false },
  ] };
  const report = diagnoseCard(parsedCard(), lore, mined());
  assert.equal(report.contract, 'card-diagnosis/0.1');
  assert.equal(report.classification, 'script-assisted-sim');
  assert.equal(report.runtime.embeddedModule.name, 'Sample module');
  assert.deepEqual(report.runtime.featureFlags, [
    { id: 'mode', enabled: true },
    { id: 'economy', enabled: false },
  ]);
  assert.ok(report.capabilities.some((item) => item.id === 'combat'));
  assert.ok(report.capabilities.some((item) => item.id === 'quests'));
  assert.ok(report.suggestedModules.includes('rpg.party'));
  assert.equal(report.assets.count, 3);
  assert.ok(report.issues.some((item) => item.code === 'embedded_runtime_code'));
  assert.ok(report.issues.some((item) => item.code === 'asset_naming_requires_mapping'));
  assert.equal(report.compilerCoverage.totalEntries, 2);
});

test('asset-only cards are classified without inventing simulation capabilities', () => {
  const parsed = parsedCard({ description: '', first_mes: '', post_history_instructions: '', alternate_greetings: [] });
  const report = diagnoseCard(parsed, { entries: [] }, mined({
    luaSize: 0,
    moduleSummary: null,
    defaultVars: { numbers: {}, numericCount: 0, totalLines: 0 },
  }));
  assert.equal(report.classification, 'asset-pack');
  assert.deepEqual(report.capabilities, []);
});

test('asset summary exposes mixed filename conventions', () => {
  const summary = summarizeAssets([
    { name: 'a_angry', ext: 'png' },
    { name: 'b.happy', ext: 'png' },
    { name: 'c&dress&sad', ext: 'png' },
    { name: 'Long Name smile', ext: 'png' },
    { name: 'plain', ext: 'png' },
  ]);
  assert.deepEqual(summary.naming, { underscore: 1, dot: 1, ampersand: 1, space: 1, plain: 1 });
  assert.equal(summary.nonUnderscoreSchemes, 3);
});

