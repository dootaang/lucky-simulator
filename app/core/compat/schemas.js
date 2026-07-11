// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const CONTRACT_IDS = Object.freeze({
  envelope: 'risu-compatibility/0.1',
  persona: 'persona/0.1',
  promptPreset: 'prompt-preset/0.1',
});

function validateRisuCompatibilityEnvelope(value) {
  const issues = [];
  objectAt(value, '$', issues);
  if (!value || typeof value !== 'object') return issues;
  exact(value.contract, CONTRACT_IDS.envelope, '$.contract', issues);
  objectAt(value.source, '$.source', issues);
  objectAt(value.raw, '$.raw', issues);
  objectAt(value.normalized, '$.normalized', issues);
  objectAt(value.compatibility, '$.compatibility', issues);
  arrayAt(value.provenance, '$.provenance', issues);
  if (value.source) {
    stringAt(value.source.format, '$.source.format', issues);
    stringAt(value.source.version, '$.source.version', issues);
    stringAt(value.source.fileName, '$.source.fileName', issues);
  }
  if (value.raw) arrayAt(value.raw.containerEntries, '$.raw.containerEntries', issues);
  if (value.normalized) {
    arrayAt(value.normalized.lorebooks, '$.normalized.lorebooks', issues);
    arrayAt(value.normalized.assets, '$.normalized.assets', issues);
    arrayAt(value.normalized.modules, '$.normalized.modules', issues);
  }
  if (value.compatibility) arrayAt(value.compatibility.features, '$.compatibility.features', issues);
  return issues;
}

function validatePersona(value) {
  const issues = [];
  objectAt(value, '$', issues);
  if (!value || typeof value !== 'object') return issues;
  exact(value.contract, CONTRACT_IDS.persona, '$.contract', issues);
  for (const key of ['id', 'name', 'prompt', 'icon', 'note']) stringAt(value[key], `$.${key}`, issues);
  if (!Number.isInteger(value.version) || value.version < 1) issues.push(issue('$.version', '1 이상의 정수여야 합니다.'));
  return issues;
}

function validatePromptPreset(value) {
  const issues = [];
  objectAt(value, '$', issues);
  if (!value || typeof value !== 'object') return issues;
  exact(value.contract, CONTRACT_IDS.promptPreset, '$.contract', issues);
  for (const key of ['id', 'name']) stringAt(value[key], `$.${key}`, issues);
  if (!['risu', 'simpack'].includes(value.compatibilityMode)) issues.push(issue('$.compatibilityMode', 'risu 또는 simpack이어야 합니다.'));
  arrayAt(value.blocks, '$.blocks', issues);
  if (Array.isArray(value.blocks)) {
    const ids = new Set();
    value.blocks.forEach((block, index) => {
      objectAt(block, `$.blocks[${index}]`, issues);
      if (!block || typeof block !== 'object') return;
      stringAt(block.id, `$.blocks[${index}].id`, issues);
      stringAt(block.type, `$.blocks[${index}].type`, issues);
      if (ids.has(block.id)) issues.push(issue(`$.blocks[${index}].id`, '블록 id가 중복됩니다.'));
      ids.add(block.id);
    });
  }
  return issues;
}

function issue(path, message) { return { level: 'error', path, message }; }
function objectAt(value, path, issues) { if (!value || typeof value !== 'object' || Array.isArray(value)) issues.push(issue(path, '객체여야 합니다.')); }
function arrayAt(value, path, issues) { if (!Array.isArray(value)) issues.push(issue(path, '배열이어야 합니다.')); }
function stringAt(value, path, issues) { if (typeof value !== 'string') issues.push(issue(path, '문자열이어야 합니다.')); }
function exact(value, expected, path, issues) { if (value !== expected) issues.push(issue(path, `${expected}여야 합니다.`)); }

module.exports = { CONTRACT_IDS, validateRisuCompatibilityEnvelope, validatePersona, validatePromptPreset };

