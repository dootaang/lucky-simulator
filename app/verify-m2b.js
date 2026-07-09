'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseCard } = require('./core/card/parseCard.js');
const { mineCard, parseLuaTables } = require('./src/llm/luaMine.js');
const { buildCompilerInput } = require('./src/llm/compilerPrompt.js');

const sourceDir = 'C:/freetalk';
const marker = '[\uCC44\uAD74\uB41C \uADDC\uCE59 \uAC12';

const appendixTables = parseLuaTables(`
-- comments are skipped
local upgradeCosts = {
  lv_tavern = {1250000, 8000000, 50000000},
  lv_kitchen = {1000000; 7000000, 40000000},
  ref = other.name
}
rankThresholds = {100,300,800,2000,5000}
roomMaxCap = {[104]=2,[106]=1,[110]=99}
`);

assert.deepStrictEqual(appendixTables.upgradeCosts.lv_tavern, [1250000, 8000000, 50000000]);
assert.deepStrictEqual(appendixTables.upgradeCosts.lv_kitchen, [1000000, 7000000, 40000000]);
assert.deepStrictEqual(appendixTables.upgradeCosts.ref, { __ref: 'other.name' });
assert.deepStrictEqual(appendixTables.rankThresholds, [100, 300, 800, 2000, 5000]);
assert.deepStrictEqual(appendixTables.roomMaxCap, { 104: 2, 106: 1, 110: 99 });

const charxNames = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.charx'));
const yongsaName = charxNames.find((name) => name !== 'Alternate Hunters V2.charx');
const alternateName = 'Alternate Hunters V2.charx';
assert(yongsaName, 'Yongsa charx fixture not found');
assert(charxNames.includes(alternateName), 'Alternate Hunters fixture not found');

const yongsa = mine(path.join(sourceDir, yongsaName));
assert.strictEqual(yongsa.archetype, 'lua-rich');
assert.deepStrictEqual(yongsa.tables.upgradeCosts.lv_tavern, [1250000, 8000000, 50000000]);
assert.deepStrictEqual(yongsa.tables.rankThresholds, [100, 300, 800, 2000, 5000]);
assert.deepStrictEqual(yongsa.tables.roomMaxCap, {
  101: 99, 102: 99, 103: 99, 104: 2, 105: 2, 106: 1, 107: 1, 108: 1, 109: 1, 110: 99, 111: 99,
});

const alternate = mine(path.join(sourceDir, alternateName));
assert.strictEqual(alternate.archetype, 'prose');

const lore = { entries: [{ name: 'fixture', content: 'rule prose', constant: true }] };
const richInput = buildCompilerInput(lore, yongsa);
assert(richInput.includes(marker), 'lua-rich compiler input must include mined block');
assert(richInput.includes('1250000'));
assert(richInput.includes('rankThresholds'));
assert(richInput.includes('roomMaxCap'));

const proseInput = buildCompilerInput(lore, alternate);
assert(!proseInput.includes(marker), 'prose compiler input must omit mined block');

console.log(JSON.stringify({
  yongsa: {
    archetype: yongsa.archetype,
    upgradeCostsLvTavern: yongsa.tables.upgradeCosts.lv_tavern,
    rankThresholds: yongsa.tables.rankThresholds,
    roomMaxCap: yongsa.tables.roomMaxCap,
    ruleTableCount: yongsa.ruleTableCount,
    luaSize: yongsa.luaSize,
  },
  alternate: {
    archetype: alternate.archetype,
    tableCount: alternate.tableCount,
    ruleTableCount: alternate.ruleTableCount,
    luaSize: alternate.luaSize,
  },
  promptBlocks: {
    luaRich: richInput.includes(marker),
    prose: proseInput.includes(marker),
  },
}, null, 2));

function mine(filePath) {
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const parsed = parseCard(bytes, path.basename(filePath), { lazy: true });
  return mineCard(parsed);
}
