'use strict';

// C2 — PromptPreset 런타임 정규화기 + 기본 프리셋 팩토리.
// 기본 순서 고증: RisuAI(kwaroran/RisuAI, GPL-3.0, 로컬 클론 commit eb7780b,
// src/ts/process/index.svelte.ts의 기본 템플릿: main → description → lorebook → chat
// → globalNote → postEverything)에 persona/memory/authornote 자리를 더한 우리 기본값.
// 정규화는 C1 schemas.js와 같은 원칙: 관용 수용 + 이슈 수집, 조용한 삭제 금지.

const BLOCK_TYPES = new Set([
  'plain', 'jailbreak', 'description', 'persona', 'lorebook', 'chat',
  'authornote', 'memory', 'cache', 'postEverything',
  'engineFacts', 'availableActions', 'groundedMemory',
]);
const ROLES = new Set(['system', 'user', 'assistant']);
const SLOTS = new Set(['main', 'globalNote', 'normal']);

function issue(path, message) {
  return { path, message };
}

function normalizePromptPreset(raw) {
  const issues = [];
  const source = raw && typeof raw === 'object' ? raw : {};
  if (!raw || typeof raw !== 'object') issues.push(issue('$', '프리셋이 객체가 아니라 기본값으로 대체합니다.'));

  const settingsRaw = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const preset = {
    contract: 'prompt-preset/0.1',
    id: typeof source.id === 'string' && source.id.trim() ? source.id : 'preset-unnamed',
    name: typeof source.name === 'string' ? source.name : '이름 없는 프리셋',
    compatibilityMode: source.compatibilityMode === 'simpack' ? 'simpack' : 'risu',
    version: Number.isInteger(source.version) && source.version >= 1 ? source.version : 1,
    blocks: [],
    settings: {
      assistantPrefill: typeof settingsRaw.assistantPrefill === 'string' ? settingsRaw.assistantPrefill : '',
      sendNames: settingsRaw.sendNames === true,
      sendChatAsSystem: settingsRaw.sendChatAsSystem === true,
    },
    raw: 'raw' in source ? source.raw : null,
  };
  if (source.compatibilityMode != null && !['risu', 'simpack'].includes(source.compatibilityMode)) {
    issues.push(issue('$.compatibilityMode', 'risu로 정규화했습니다.'));
  }

  const blocksRaw = Array.isArray(source.blocks) ? source.blocks : [];
  if (!Array.isArray(source.blocks)) issues.push(issue('$.blocks', '블록 배열이 없어 빈 목록으로 시작합니다.'));
  const seenIds = new Set();
  blocksRaw.forEach((blockRaw, index) => {
    const path = `$.blocks[${index}]`;
    if (!blockRaw || typeof blockRaw !== 'object') {
      issues.push(issue(path, '객체가 아닌 블록을 제외합니다.'));
      return;
    }
    if (!BLOCK_TYPES.has(blockRaw.type)) {
      issues.push(issue(`${path}.type`, `지원하지 않는 블록 타입(${String(blockRaw.type)})을 제외합니다.`));
      return;
    }
    let id = typeof blockRaw.id === 'string' && blockRaw.id.trim() ? blockRaw.id.trim() : `block-${index}`;
    if (seenIds.has(id)) {
      issues.push(issue(`${path}.id`, `중복 id(${id})에 접미사를 붙입니다.`));
      id = `${id}-${index}`;
    }
    seenIds.add(id);

    const block = {
      id,
      type: blockRaw.type,
      name: typeof blockRaw.name === 'string' ? blockRaw.name : id,
      enabled: blockRaw.enabled !== false,
      source: blockRaw.source && typeof blockRaw.source === 'object' ? blockRaw.source : null,
    };
    if (blockRaw.type === 'plain' || blockRaw.type === 'jailbreak') {
      block.role = ROLES.has(blockRaw.role) ? blockRaw.role : 'system';
      if (blockRaw.role != null && !ROLES.has(blockRaw.role)) issues.push(issue(`${path}.role`, 'system으로 정규화했습니다.'));
      block.text = typeof blockRaw.text === 'string' ? blockRaw.text : '';
      block.slot = SLOTS.has(blockRaw.slot) ? blockRaw.slot : 'normal';
      if (blockRaw.slot != null && !SLOTS.has(blockRaw.slot)) issues.push(issue(`${path}.slot`, 'normal로 정규화했습니다.'));
    } else if (blockRaw.type === 'chat') {
      const start = Math.trunc(Number(blockRaw.rangeStart));
      block.rangeStart = Number.isFinite(start) ? start : 0;
      if (blockRaw.rangeEnd === 'end') block.rangeEnd = 'end';
      else {
        const end = Math.trunc(Number(blockRaw.rangeEnd));
        block.rangeEnd = Number.isFinite(end) ? end : 'end';
      }
    } else if (blockRaw.type === 'cache') {
      const depth = Math.trunc(Number(blockRaw.depth));
      block.depth = Number.isFinite(depth) ? depth : 0;
      block.role = ['system', 'user', 'assistant', 'all'].includes(blockRaw.role) ? blockRaw.role : 'all';
    } else if (['engineFacts', 'availableActions', 'groundedMemory'].includes(blockRaw.type)) {
      block.role = 'system';
    } else {
      if (blockRaw.role != null) {
        if (ROLES.has(blockRaw.role)) block.role = blockRaw.role;
        else issues.push(issue(`${path}.role`, '역할이 유효하지 않아 생략(system 취급)합니다.'));
      }
      if (typeof blockRaw.innerFormat === 'string') block.innerFormat = blockRaw.innerFormat;
    }
    preset.blocks.push(block);
  });

  return { preset, issues };
}

const ENGINE_BLOCKS = [
  { id: 'engine-facts', type: 'engineFacts', name: '엔진 사실', enabled: true, role: 'system', source: null },
  { id: 'available-actions', type: 'availableActions', name: '가능한 행동', enabled: true, role: 'system', source: null },
  { id: 'grounded-memory', type: 'groundedMemory', name: '근거 기억', enabled: true, role: 'system', source: null },
];

function createDefaultPreset({ compatibilityMode = 'risu' } = {}) {
  const blocks = [
    { id: 'main', type: 'plain', name: '메인 프롬프트', enabled: true, role: 'system', text: '', slot: 'main', source: null },
    { id: 'description', type: 'description', name: '캐릭터 설명', enabled: true, source: null },
    { id: 'persona', type: 'persona', name: '페르소나', enabled: true, source: null },
    { id: 'lorebook', type: 'lorebook', name: '로어북', enabled: true, source: null },
    { id: 'memory', type: 'memory', name: '메모리', enabled: true, source: null },
  ];
  if (compatibilityMode === 'simpack') blocks.push(...ENGINE_BLOCKS.map((block) => ({ ...block })));
  blocks.push(
    { id: 'chat', type: 'chat', name: '대화', enabled: true, rangeStart: 0, rangeEnd: 'end', source: null },
    { id: 'authornote', type: 'authornote', name: '작가 노트', enabled: true, source: null },
    { id: 'global-note', type: 'plain', name: '글로벌 노트', enabled: true, role: 'system', text: '', slot: 'globalNote', source: null },
    { id: 'post-everything', type: 'postEverything', name: '맨 끝', enabled: true, source: null },
  );
  return {
    contract: 'prompt-preset/0.1',
    id: compatibilityMode === 'simpack' ? 'preset-simpack-default' : 'preset-risu-default',
    name: compatibilityMode === 'simpack' ? '기본 프리셋 (SimPack 강화)' : '기본 프리셋 (Risu 호환)',
    compatibilityMode,
    version: 1,
    blocks,
    settings: { assistantPrefill: '', sendNames: false, sendChatAsSystem: false },
    raw: null,
  };
}

module.exports = { normalizePromptPreset, createDefaultPreset };
