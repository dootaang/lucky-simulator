'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeCompilerCoverage, buildCompilerInput } = require('../src/llm/compilerPrompt.js');

test('compiler coverage reports the same selected entries that enter the prompt', () => {
  const lore = { entries: [
    { name: 'Core rules', content: 'A'.repeat(90000), constant: true },
    { name: 'Large profile', content: 'B'.repeat(90000), constant: false },
    { name: 'Omitted system', content: 'C'.repeat(90000), constant: false },
  ] };
  const coverage = analyzeCompilerCoverage(lore, null);
  const input = buildCompilerInput(lore, null);
  assert.equal(coverage.totalEntries, 3);
  assert.equal(coverage.includedEntries, 2);
  assert.equal(coverage.omittedEntries, 1);
  assert.deepEqual(coverage.omitted.map((entry) => entry.name), ['Omitted system']);
  assert.match(input, /Core rules/);
  assert.match(input, /Large profile/);
  assert.doesNotMatch(input, /Omitted system/);
});

test('empty coverage leaves mock fallback behavior intact', () => {
  const coverage = analyzeCompilerCoverage({ entries: [] }, null);
  assert.equal(coverage.totalEntries, 0);
  assert.equal(coverage.rulebookText, '');
  assert.match(buildCompilerInput({ entries: [] }, null), /Mock lorebook entry/);
});

