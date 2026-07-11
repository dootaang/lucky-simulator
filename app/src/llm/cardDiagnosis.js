'use strict';

const { mineCard } = require('./luaMine.js');
const { analyzeCompilerCoverage } = require('./compilerPrompt.js');

const CAPABILITY_RULES = [
  ['combat', /전투|공략|레이드|combat|battle|raid/i, 'rpg.combat'],
  ['quests', /퀘스트|의뢰|임무|목표|quest|mission|objective/i, 'rpg.quests'],
  ['progression', /레벨|경험치|스탯 포인트|성장|level|\bexp\b|growth/i, 'core.progression'],
  ['inventory', /인벤토리|소지품|아이템|inventory|items?/i, 'core.inventory'],
  ['equipment', /장비|무기|방어구|장신구|equipment|weapon|armou?r|accessor/i, 'core.equipment'],
  ['party', /파티|제대|분대|편성|party|echelon|squad|formation/i, 'rpg.party'],
  ['time', /날짜|시간|달력|일정|주간|date|time|calendar|schedule|weekly/i, 'core.time'],
  ['location', /장소|지역|지도|이동|location|region|map|travel/i, 'core.location'],
  ['economy', /경제|가격|재화|화폐|골드|코인|상점|시장|econom|price|currency|gold|coin|shop|store|market/i, 'rpg.shop'],
  ['facilities', /시설\s*(?:관리|경영|레벨|업그레이드)|기지\s*(?:관리|경영|건설)|영지\s*(?:운영|경영)|facility\s*(?:management|level|upgrade)|base\s*(?:management|building)|domain\s*management/i, 'core.facilities'],
  ['factions', /세력|길드|협회|조직|faction|guild|association|organization/i, 'core.factions'],
  ['relations', /호감도|관계도|친밀도|relationship\s+affinity|affinity\s+(?:with|toward)/i, 'core.relations'],
  ['crafting', /제작|연금술|조합|craft|alchemy|recipe/i, 'rpg.crafting'],
  ['jobs', /제조\s*(?:시간|대기|완료)|수복\s*(?:시간|대기|완료)|건설\s*(?:시간|대기|완료)|manufactur(?:ing)?\s*(?:queue|time|complete)|repair\s*(?:queue|time|complete)|construction\s*(?:queue|time|project)/i, 'core.jobs'],
  ['screens', /상태창|패널|화면|status window|panel|screen|\bhud\b/i, null],
  ['events', /사건|이벤트|돌발|incident|event|encounter/i, null],
];

function diagnoseCard(parsed, lore, suppliedMined) {
  const mined = suppliedMined || mineCard(parsed);
  const data = cardData(parsed);
  const entries = Array.isArray(lore && lore.entries) ? lore.entries : [];
  const realEntries = entries.filter((entry) => !entry.isFolder && String(entry.content || '').trim());
  const description = String(data.description || '');
  const firstMessage = String(data.first_mes || '');
  const postInstructions = String(data.post_history_instructions || '');
  const alternateGreetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
  const risu = data.extensions && data.extensions.risuai || {};
  const assets = Array.isArray(parsed && parsed.assets) ? parsed.assets : [];
  const coverage = analyzeCompilerCoverage(lore, mined);
  const macroStats = countMacros([description, firstMessage, postInstructions, ...alternateGreetings, ...realEntries.map((entry) => entry.content)].join('\n'));
  const capabilities = detectCapabilities(description, realEntries);
  const assetSummary = summarizeAssets(assets);
  const htmlChars = String(risu.backgroundHTML || '').length + String(risu.inlayViewScreen || '').length;
  const luaChars = Number(mined && mined.luaSize || 0) + Number(mined && mined.cardLuaSize || 0);
  const regexCount = Number(mined && mined.moduleSummary && mined.moduleSummary.regexCount || 0);
  const issues = [];

  if (coverage.omittedEntries > 0) issues.push(issue(
    'warn', 'compiler_input_trimmed',
    `컴파일 입력에서 로어 ${coverage.omittedEntries}개(${coverage.omittedChars.toLocaleString('ko-KR')}자)가 제외됩니다.`,
    coverage.omitted.slice(0, 20).map((entry) => entry.name)
  ));
  if (luaChars > 0) issues.push(issue(
    'warn', 'embedded_runtime_code',
    `Lua ${luaChars.toLocaleString('ko-KR')}자는 실행하지 않고 정적 분석만 합니다.`,
    mined && mined.moduleSummary && mined.moduleSummary.name ? [mined.moduleSummary.name] : []
  ));
  if (regexCount > 0) issues.push(issue(
    'info', 'display_regex_requires_translation',
    `정규식·화면 변환 ${regexCount}개는 안전한 위젯으로 옮길지 검토해야 합니다.`
  ));
  if (htmlChars > 0) issues.push(issue(
    'info', 'html_requires_translation',
    `카드 HTML ${htmlChars.toLocaleString('ko-KR')}자는 그대로 실행하지 않고 화면 선언으로 변환해야 합니다.`
  ));
  if (assetSummary.nonUnderscoreSchemes > 0) issues.push(issue(
    'info', 'asset_naming_requires_mapping',
    `에셋 ${assetSummary.nonUnderscoreSchemes.toLocaleString('ko-KR')}개가 점·공백·& 명명법을 사용합니다. canonical 인물 매핑이 필요합니다.`
  ));

  const entityKeys = entityKeySet(realEntries);
  const featureFlags = Object.entries(mined && mined.defaultVars && mined.defaultVars.numbers || {})
    .filter(([id, value]) => (value === 0 || value === 1) && !entityKeys.has(String(id).toLowerCase()))
    .slice(0, 100)
    .map(([id, value]) => ({ id, enabled: value === 1 }));

  return {
    contract: 'card-diagnosis/0.1',
    card: {
      name: String(data.name || parsed && parsed.name || parsed && parsed.source || '이름 없는 카드'),
      format: String(parsed && parsed.format || 'unknown'),
      spec: String(parsed && parsed.card && parsed.card.spec || parsed && parsed.spec || ''),
      source: String(parsed && parsed.source || ''),
    },
    classification: classify({ assets: assets.length, realEntries: realEntries.length, description, luaChars, regexCount, macroStats, capabilities }),
    content: {
      loreEntries: realEntries.length,
      loreChars: realEntries.reduce((sum, entry) => sum + String(entry.content || '').length, 0),
      constantEntries: realEntries.filter((entry) => entry.constant).length,
      alternateGreetings: alternateGreetings.length,
      descriptionChars: description.length,
      firstMessageChars: firstMessage.length,
      postInstructionChars: postInstructions.length,
    },
    runtime: {
      embeddedModule: mined && mined.moduleSummary || null,
      luaChars,
      cardScripts: mined && mined.cardScriptSummary || null,
      defaultVariableLines: Number(mined && mined.defaultVars && mined.defaultVars.totalLines || 0),
      featureFlags,
      macros: macroStats,
      htmlChars,
    },
    assets: assetSummary,
    dependencies: {
      sourceRefs: Array.isArray(risu.source) ? risu.source.slice() : [],
      additionalAssets: Array.isArray(risu.additionalAssets) ? risu.additionalAssets.length : 0,
      embeddedModules: Array.isArray(parsed && parsed.embeddedModules) ? parsed.embeddedModules.slice() : [],
    },
    capabilities,
    suggestedModules: Array.from(new Set(capabilities.map((item) => item.module).filter(Boolean))),
    compilerCoverage: {
      maxChars: coverage.maxChars,
      totalEntries: coverage.totalEntries,
      includedEntries: coverage.includedEntries,
      omittedEntries: coverage.omittedEntries,
      includedChars: coverage.includedChars,
      omittedChars: coverage.omittedChars,
      omitted: coverage.omitted,
    },
    issues,
  };
}

function entityKeySet(entries) {
  const out = new Set();
  for (const entry of entries) {
    if (entry && entry.name) out.add(String(entry.name).trim().toLowerCase());
    for (const key of Array.isArray(entry && entry.keys) ? entry.keys : []) {
      if (String(key).trim()) out.add(String(key).trim().toLowerCase());
    }
  }
  return out;
}

function cardData(parsed) {
  const card = parsed && parsed.card || {};
  return card.data || card || {};
}

function detectCapabilities(description, entries) {
  const sources = [{ name: '카드 설명', content: description }, ...entries.map((entry) => ({
    name: String(entry.name || entry.comment || '이름 없는 로어'),
    content: `${entry.name || ''}\n${entry.content || ''}`,
  }))];
  return CAPABILITY_RULES.flatMap(([id, pattern, module]) => {
    const evidence = sources.filter((source) => pattern.test(source.content)).slice(0, 8).map((source) => source.name);
    return evidence.length ? [{ id, module, evidence }] : [];
  });
}

function countMacros(text) {
  const counts = {};
  for (const match of String(text || '').matchAll(/\{\{\s*([^}:\s]+)(?:::|:|\s|\}\})/g)) {
    const key = String(match[1]).toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, count]) => ({ id, count }));
}

function summarizeAssets(assets) {
  const media = {};
  const naming = { underscore: 0, dot: 0, ampersand: 0, space: 0, plain: 0 };
  for (const asset of assets) {
    const mediaType = String(asset && (asset.mime || asset.ext) || 'unknown');
    media[mediaType] = (media[mediaType] || 0) + 1;
    const name = String(asset && asset.name || '');
    let matched = false;
    if (name.includes('_')) { naming.underscore++; matched = true; }
    if (name.includes('.')) { naming.dot++; matched = true; }
    if (name.includes('&')) { naming.ampersand++; matched = true; }
    if (name.includes(' ')) { naming.space++; matched = true; }
    if (!matched) naming.plain++;
  }
  const nonUnderscoreSchemes = assets.filter((asset) => {
    const name = String(asset && asset.name || '');
    return !name.includes('_') && (name.includes('.') || name.includes('&') || name.includes(' '));
  }).length;
  return { count: assets.length, media, naming, nonUnderscoreSchemes };
}

function classify(input) {
  if (input.assets > 0 && !input.realEntries && !input.description && !input.luaChars) return 'asset-pack';
  if (input.luaChars > 0 || input.regexCount > 0) return 'script-assisted-sim';
  const variableMacros = input.macroStats.filter((item) => ['getvar', 'setvar', 'addvar', 'incvar', 'decvar'].includes(item.id))
    .reduce((sum, item) => sum + item.count, 0);
  if (variableMacros >= 20) return 'declarative-sim';
  if (input.capabilities.length >= 4) return 'prose-sim';
  return 'narrative-card';
}

function issue(level, code, message, evidence = []) {
  return { level, code, message, evidence };
}

module.exports = { diagnoseCard, detectCapabilities, countMacros, summarizeAssets };
