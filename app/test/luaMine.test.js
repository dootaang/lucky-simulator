'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mineCard,
  parseLuaTables,
  parseValue,
  parseNumberRange,
  parseDefaultVariables,
} = require('../src/llm/luaMine.js');
const { formatMinedRules } = require('../src/llm/compilerPrompt.js');

test('block-commented tables are not mined', () => {
  const tables = parseLuaTables('--[[ ghost = {9,9} ]] real = {1,2}');
  assert.equal(Object.hasOwn(tables, 'ghost'), false);
  assert.deepEqual(tables.real, [1, 2]);
});

test('multiline block comments are skipped before the next table', () => {
  const tables = parseLuaTables('--[[\nghost = { 9, 9 }\nmore text\n]]\nreal = { 3, 4 }');
  assert.deepEqual(tables, { real: [3, 4] });
});

test('leveled block comments use a matching close delimiter', () => {
  const tables = parseLuaTables('--[==[ ghost = {1} ]] still comment ]==]\nreal = {5,6}');
  assert.deepEqual(tables, { real: [5, 6] });
});

test('unterminated block comments consume the remaining input without crashing', () => {
  assert.doesNotThrow(() => parseLuaTables('--[[ ghost = {9}\nreal = {1,2}'));
  assert.deepEqual(parseLuaTables('--[[ ghost = {9}\nreal = {1,2}'), {});
});

test('long-bracket strings preserve their raw multiline content', () => {
  const tables = parseLuaTables('t = { desc = [[여러\n줄]] , n = 5 }');
  assert.deepEqual(tables.t, { desc: '여러\n줄', n: 5 });
});

test('unterminated long-bracket strings return the remaining input without crashing', () => {
  let parsed;
  assert.doesNotThrow(() => { parsed = parseValue('[[unfinished\ntext', 0); });
  assert.deepEqual(parsed, ['unfinished\ntext', '[[unfinished\ntext'.length]);
});

test('leveled long strings are values and bracket keys keep their legacy path', () => {
  const [value] = parseValue('[=[left ]] middle\nright]=]', 0);
  assert.equal(value, 'left ]] middle\nright');
  assert.deepEqual(parseLuaTables('t = { [=[two]=] }').t, ['two']);
  assert.deepEqual(parseLuaTables('t = { [1] = "one" }').t, { 1: 'one' });
});

test('nested tables and line comments retain existing parsing behavior', () => {
  const tables = parseLuaTables('t = { nested = { 1, -- note\n2 }, value = 3 }');
  assert.deepEqual(tables.t, { nested: [1, 2], value: 3 });
});

test('quoted-string escapes retain the simplified legacy behavior', () => {
  const tables = parseLuaTables(String.raw`t = { value = "a\"b" }`);
  assert.equal(tables.t.value, 'a"b');
});

test('unterminated quoted strings do not crash', () => {
  assert.doesNotThrow(() => parseLuaTables('t = { value = "unfinished'));
  assert.equal(parseLuaTables('t = { value = "unfinished').t.value, 'unfinished');
});

test('numeric range parsing retains established cases', () => {
  assert.deepEqual(parseNumberRange('300,000~1,000,000'), [300000, 1000000]);
  assert.deepEqual(parseNumberRange('3~8만원'), [30000, 80000]);
  assert.equal(parseNumberRange('C~B'), null);
});

test('defaultVariables mines only numeric assignments and reports counts', () => {
  const parsed = parseDefaultVariables('gold=5000\nname=Commander\nempty=\nratio=-1.25\nplain text\nsmall=.5');
  assert.deepEqual(parsed, {
    numbers: { gold: 5000, ratio: -1.25, small: 0.5 },
    numericCount: 3,
    totalLines: 5,
  });
});

test('card scripts and defaultVariables are mined without module.risum', () => {
  const defaults = Array.from({ length: 20 }, (_, i) => `v${i}=${i}`).join('\n');
  const mined = mineCard({
    card: { data: { extensions: { risuai: {
      triggerscript: [{ effect: [{ code: 'upgradeCosts = { room = { 10, 20 } }' }] }],
      defaultVariables: defaults,
    } } } },
  });
  assert.equal(mined.hasModule, false);
  assert.equal(mined.archetype, 'lua-rich');
  assert.deepEqual(mined.tables.upgradeCosts, { room: [10, 20] });
  assert.equal(mined.defaultVars.numbers.v19, 19);
  assert.equal(mined.cardLuaSize > 0, true);
});

test('missing module and card scripts retains prose fallback', () => {
  const mined = mineCard({ card: { data: {} } });
  assert.equal(mined.archetype, 'prose');
  assert.equal(mined.reason, 'module.risum not found');
});

test('mined rules include and omit the card defaults block as appropriate', () => {
  const included = formatMinedRules({ archetype: 'prose', defaultVars: { numbers: { B: 2, A: 1 } } });
  assert.match(included, /\[카드 기본 변수/);
  assert.ok(included.indexOf('A = 1') < included.indexOf('B = 2'));
  assert.equal(formatMinedRules({ archetype: 'prose', defaultVars: { numbers: {} } }), '');
});

test('card defaults block is capped at 200 names and logs the overflow', () => {
  const numbers = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`v${String(i).padStart(3, '0')}`, i]));
  const originalInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  try {
    const block = formatMinedRules({ archetype: 'prose', defaultVars: { numbers } });
    assert.match(block, /v199 = 199/);
    assert.doesNotMatch(block, /v200 = 200/);
    assert.deepEqual(logs, [['[simbot] default variables trimmed', { included: 200, omitted: 1 }]]);
  } finally {
    console.info = originalInfo;
  }
});
