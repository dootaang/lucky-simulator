'use strict';

const { inflateSync, unzipSync } = require('fflate');
const { parseRisum } = require('../../core/card/risum.js');

const RULE_TABLE_RE = /(cost|threshold|reward|price|rank|cap|capacity|room|max|upgrade)/i;
const CONSTANT_RE = /(cost|threshold|reward|price|rank|cap|capacity|room|max|upgrade|gold|exp|level)/i;

function mineCard(parsed) {
  try {
    const moduleBytes = extractModuleRisum(parsed);
    const cardScripts = collectCardScripts(parsed);
    // defaultVariables만 있는 카드도 채굴 대상(감사 지적: 조기 차단 금지).
    if (!moduleBytes && !cardScripts.luaParts.length && !cardScripts.defaultVars.numericCount) return fallback('module.risum not found');

    let moduleRoot = null;
    let moduleLua = '';
    if (moduleBytes) {
      const decoded = parseRisum(moduleBytes);
      const root = decoded && decoded.module;
      moduleRoot = root && root.module ? root.module : root;
      moduleLua = collectLuaCode(moduleRoot).join('\n\n');
    }
    const cardLua = cardScripts.luaParts.join('\n\n');
    // Parse sources independently so module.risum remains authoritative on name collisions.
    const tables = Object.assign({}, parseLuaTables(cardLua), parseLuaTables(moduleLua));
    normalizeRanges(tables);
    const constants = Object.assign({}, parseLuaConstants(cardLua), parseLuaConstants(moduleLua));
    const tableNames = Object.keys(tables);
    const ruleTableNames = tableNames.filter((name) => RULE_TABLE_RE.test(name) && numericSignal(tables[name]));
    const allLua = [moduleLua, cardLua].filter(Boolean).join('\n\n');
    const setVarCount = countMatches(allLua, /\b(?:setChatVar|setvar)\s*\(/gi);
    const cardDefaultsSignal = cardScripts.defaultVars.numericCount >= 20; // Lua 없이 변수만 많은 카드도 신호(감사 지적)
    const archetype = ruleTableNames.length >= 3 || cardDefaultsSignal ? 'lua-rich' : 'prose';
    const result = {
      hasModule: !!moduleBytes,
      archetype,
      tables,
      constants,
      moduleLoreCount: Array.isArray(moduleRoot && moduleRoot.lorebook) ? moduleRoot.lorebook.length : 0,
      luaSize: moduleLua.length,
      cardLuaSize: cardLua.length,
      luaPurpose: summarizePurpose(moduleLua || cardLua),
      defaultVars: cardScripts.defaultVars,
      tableCount: tableNames.length,
      ruleTableCount: ruleTableNames.length,
      ruleTableNames,
      setVarCount,
    };
    logMine(result);
    return result;
  } catch (err) {
    return fallback(err && err.message ? err.message : String(err || 'mining failed'));
  }
}

function collectCardScripts(parsed) {
  const risuai = parsed && parsed.card && parsed.card.data && parsed.card.data.extensions
    && parsed.card.data.extensions.risuai;
  const luaParts = [];
  const triggers = Array.isArray(risuai && risuai.triggerscript) ? risuai.triggerscript : [];
  for (const trigger of triggers) {
    const effects = Array.isArray(trigger && trigger.effect) ? trigger.effect : [];
    for (const effect of effects) {
      if (effect && typeof effect.code === 'string') luaParts.push(effect.code);
    }
  }
  const defaultVars = parseDefaultVariables(typeof (risuai && risuai.defaultVariables) === 'string'
    ? risuai.defaultVariables : '');
  return { luaParts, defaultVars };
}

function parseDefaultVariables(text) {
  const numbers = {};
  let totalLines = 0;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const equalsAt = rawLine.indexOf('=');
    if (equalsAt < 0) continue;
    const key = rawLine.slice(0, equalsAt).trim();
    // 인라인 주석("A_gold = 5000 -- 메모") 제거 후 판정(감사 지적: 주석 때문에 수치 라인이 통째로 스킵됨).
    const value = rawLine.slice(equalsAt + 1).replace(/--.*$/, '').trim();
    if (!key || /\s/.test(key)) continue; // 공백 낀 키는 유효 식별자가 아니다(감사 지적)
    totalLines++;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) continue;
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    numbers[key] = number;
  }
  // 중복 키는 마지막 값이 이기고, 개수는 고유 키 기준(감사 지적: 대입 횟수 누적으로 아키타입 오판 가능).
  return { numbers, numericCount: Object.keys(numbers).length, totalLines };
}

function extractModuleRisum(parsed) {
  const bytes = parsed && parsed._bytes;
  if (!bytes) return null;
  const b = toBytes(bytes);
  if (parsed && parsed.format === 'risum') return b;
  if (!(b[0] === 0x50 && b[1] === 0x4b)) return null;

  try {
    const files = unzipSync(b, { filter: (file) => file.name === 'module.risum' || /\.risum$/i.test(file.name) });
    if (files['module.risum']) return files['module.risum'];
    const key = Object.keys(files).find((name) => /\.risum$/i.test(name));
    if (key) return files[key];
  } catch (err) {
    logFallback(`fflate module lookup failed: ${err && err.message ? err.message : err}`);
  }

  return extractZipEntryByLocalHeader(b, 'module.risum') || extractFirstRisumByLocalHeader(b);
}

function extractZipEntryByLocalHeader(bytes, targetName) {
  return scanZipLocalHeaders(bytes, (name) => name === targetName);
}

function extractFirstRisumByLocalHeader(bytes) {
  return scanZipLocalHeaders(bytes, (name) => /\.risum$/i.test(name));
}

function scanZipLocalHeaders(bytes, acceptName) {
  const decoder = textDecoder();
  let off = 0;
  while (off + 30 <= bytes.length) {
    if (u32(bytes, off) !== 0x04034b50) {
      off = indexLocalHeader(bytes, off + 1);
      if (off < 0) return null;
    }
    const compression = u16(bytes, off + 8);
    const compressedSize = u32(bytes, off + 18);
    const nameLen = u16(bytes, off + 26);
    const extraLen = u16(bytes, off + 28);
    const nameStart = off + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart > bytes.length) return null;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    let dataEnd = compressedSize > 0 ? dataStart + compressedSize : indexLocalHeader(bytes, dataStart + 1);
    if (dataEnd < 0) dataEnd = bytes.length;
    if (acceptName(name)) {
      const payload = bytes.subarray(dataStart, dataEnd);
      if (compression === 0) return payload;
      if (compression === 8) return inflateSync(payload);
      throw new Error(`unsupported zip compression ${compression} for ${name}`);
    }
    off = dataEnd;
  }
  return null;
}

function collectLuaCode(moduleRoot) {
  const out = [];
  const triggers = Array.isArray(moduleRoot && moduleRoot.trigger) ? moduleRoot.trigger : [];
  for (const trigger of triggers) {
    const effects = Array.isArray(trigger && trigger.effect) ? trigger.effect : [];
    for (const effect of effects) {
      if (effect && typeof effect.code === 'string') out.push(effect.code);
    }
  }
  return out;
}

function parseLuaTables(lua) {
  const tables = {};
  const re = /(?:local\s+)?(\w+)\s*=\s*\{/g;
  const searchable = maskLongBrackets(lua);
  let match;
  while ((match = re.exec(searchable))) {
    const braceIndex = match.index + match[0].lastIndexOf('{');
    const parsed = parseValue(lua, braceIndex);
    tables[match[1]] = parsed[0];
    re.lastIndex = parsed[1];
  }
  return tables;
}

function parseLuaConstants(lua) {
  const constants = {};
  const re = /(?:^|[^\w.])(?:local\s+)?(\w+)\s*=\s*(-?\d+(?:\.\d+)?)(?![\w.])/g;
  let match;
  while ((match = re.exec(lua))) {
    const name = match[1];
    const before = lua[match.index + match[0].indexOf('=') - 1];
    const after = lua[re.lastIndex];
    if (before === '=' || before === '~' || before === '<' || before === '>' || after === '=') continue;
    if (CONSTANT_RE.test(name)) constants[name] = Number(match[2]);
  }
  return constants;
}

function skip(s, i) {
  while (i < s.length) {
    if (/\s/.test(s[i])) i++;
    else if (s.slice(i, i + 2) === '--') {
      const bracket = longBracketAt(s, i + 2);
      if (bracket) i = longBracketEnd(s, bracket);
      else while (i < s.length && s[i] !== '\n') i++;
    }
    else break;
  }
  return i;
}

function longBracketAt(s, i) {
  if (s[i] !== '[') return null;
  let j = i + 1;
  while (s[j] === '=') j++;
  if (s[j] !== '[') return null;
  return { contentStart: j + 1, close: `]${'='.repeat(j - i - 1)}]` };
}

function longBracketEnd(s, bracket) {
  const closeAt = s.indexOf(bracket.close, bracket.contentStart);
  return closeAt < 0 ? s.length : closeAt + bracket.close.length;
}

function parseLongString(s, i) {
  const bracket = longBracketAt(s, i);
  const closeAt = bracket ? s.indexOf(bracket.close, bracket.contentStart) : -1;
  if (!bracket) return [null, i + 1];
  if (closeAt < 0) return [s.slice(bracket.contentStart), s.length];
  return [s.slice(bracket.contentStart, closeAt), closeAt + bracket.close.length];
}

// Keep offsets stable for the assignment regex while hiding regions where Lua code is inert.
// Quoted strings and ordinary line comments retain their legacy discovery behavior.
function maskLongBrackets(s) {
  const out = s.split('');
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' || s[i] === "'") {
      const quote = s[i++];
      while (i < s.length && s[i] !== quote) i += s[i] === '\\' ? 2 : 1;
      if (i < s.length) i++;
      continue;
    }
    if (s.slice(i, i + 2) === '--') {
      const bracket = longBracketAt(s, i + 2);
      if (bracket) {
        const end = longBracketEnd(s, bracket);
        for (let j = i; j < end; j++) if (s[j] !== '\n' && s[j] !== '\r') out[j] = ' ';
        i = end;
        continue;
      }
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    const bracket = longBracketAt(s, i);
    if (bracket) {
      const end = longBracketEnd(s, bracket);
      for (let j = i; j < end; j++) if (s[j] !== '\n' && s[j] !== '\r') out[j] = ' ';
      i = end;
      continue;
    }
    i++;
  }
  return out.join('');
}

function parseStr(s, i) {
  const q = s[i]; i++; let out = '';
  while (i < s.length && s[i] !== q) {
    if (s[i] === '\\') { out += s[i + 1]; i += 2; } else { out += s[i++]; }
  }
  return [out, i + 1];
}

function parseValue(s, i) {
  i = skip(s, i);
  const c = s[i];
  if (c === '{') return parseTable(s, i);
  if (c === '"' || c === "'") return parseStr(s, i);
  if (c === '[' && longBracketAt(s, i)) return parseLongString(s, i);
  const num = /^-?\d+(\.\d+)?/.exec(s.slice(i));
  if (num) return [Number(num[0]), i + num[0].length];
  const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i));
  if (id) return [{ __ref: id[0] }, i + id[0].length];
  return [null, i + 1];
}

function parseTable(s, i) {
  i++; const arr = []; const obj = {}; let isArr = true;
  for (;;) {
    i = skip(s, i);
    if (s[i] === '}') { i++; break; }
    if (i >= s.length) break;
    if (s[i] === '[' && !longBracketAt(s, i)) {
      const [k, i2] = parseValue(s, i + 1);
      let j = skip(s, i2); if (s[j] === ']') j++; j = skip(s, j);
      if (s[j] === '=') { const [v, i3] = parseValue(s, j + 1); obj[String(k)] = v; isArr = false; i = i3; } else i = j;
    } else {
      const idm = /^[A-Za-z_]\w*/.exec(s.slice(i));
      let j = idm ? skip(s, i + idm[0].length) : i;
      if (idm && s[j] === '=' && s[j + 1] !== '=') { const [v, i2] = parseValue(s, j + 1); obj[idm[0]] = v; isArr = false; i = i2; }
      else { const [v, i2] = parseValue(s, i); arr.push(v); i = i2; }
    }
    i = skip(s, i);
    if (s[i] === ',' || s[i] === ';') i++;
  }
  return [isArr ? arr : obj, i];
}

// 카드 룰표의 값은 종종 문자열 범위로 적힌다("300,000~1,000,000", "3~8만원", "50~150만").
// 이런 "온전히 숫자 범위인" 문자열만 [min,max] 숫자 배열로 승격한다. 프로즈("소소한 선물 …")나
// 색상 코드("99,99,255"), 랭크 문자열("C~B")은 전체 매칭 실패로 그대로 남는다.
const RANGE_UNIT = { '만': 10000, '억': 100000000 };
const RANGE_RE = /^(-?[\d,]+(?:\.\d+)?)(만|억)?[~〜～\-–—](-?[\d,]+(?:\.\d+)?)(만|억)?원?$/;

function parseNumberRange(raw) {
  const t = String(raw == null ? '' : raw).replace(/\s+/g, '');
  const m = RANGE_RE.exec(t);
  if (!m) return null;
  const u2 = m[4] ? RANGE_UNIT[m[4]] : 1;
  const u1 = m[2] ? RANGE_UNIT[m[2]] : u2; // 뒤 숫자에만 단위가 붙으면("3~8만") 앞에도 적용
  const lo = toRangeNumber(m[1], u1);
  const hi = toRangeNumber(m[3], u2);
  if (lo == null || hi == null) return null;
  return [lo, hi];
}

function toRangeNumber(numStr, unit) {
  const n = Number(String(numStr).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n * unit;
}

function normalizeRanges(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') {
        const range = parseNumberRange(node[i]);
        if (range) node[i] = range;
      } else if (node[i] && typeof node[i] === 'object' && !node[i].__ref) {
        normalizeRanges(node[i]);
      }
    }
  } else if (node && typeof node === 'object' && !node.__ref) {
    for (const key of Object.keys(node)) {
      if (typeof node[key] === 'string') {
        const range = parseNumberRange(node[key]);
        if (range) node[key] = range;
      } else if (node[key] && typeof node[key] === 'object' && !node[key].__ref) {
        normalizeRanges(node[key]);
      }
    }
  }
}

function numericSignal(value) {
  let numbers = 0;
  let total = 0;
  walk(value, (item) => {
    total++;
    if (typeof item === 'number' && Number.isFinite(item)) numbers++;
  });
  return numbers >= 2 || (numbers >= 1 && total <= 3);
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === 'object' && !value.__ref) {
    for (const key of Object.keys(value)) walk(value[key], visit);
  }
}

function summarizePurpose(lua) {
  const lines = String(lua || '').split(/\r?\n/);
  const comments = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (comments.length) break;
      continue;
    }
    if (!trimmed.startsWith('--')) break;
    const text = trimmed.replace(/^--\s?/, '').trim();
    if (text && !/^=+$/.test(text)) comments.push(text);
    if (comments.length >= 3) break;
  }
  return comments.join(' / ');
}

function fallback(reason) {
  const result = {
    hasModule: false,
    archetype: 'prose',
    tables: {},
    constants: {},
    moduleLoreCount: 0,
    luaSize: 0,
    cardLuaSize: 0,
    luaPurpose: '',
    defaultVars: { numbers: {}, numericCount: 0, totalLines: 0 },
    tableCount: 0,
    ruleTableCount: 0,
    ruleTableNames: [],
    setVarCount: 0,
    reason: String(reason || 'mining unavailable'),
  };
  logFallback(result.reason);
  return result;
}

function logMine(result) {
  if (typeof console !== 'undefined' && console.info) {
    console.info('[simbot] lua mining', {
      archetype: result.archetype,
      tables: result.tableCount,
      ruleTables: result.ruleTableCount,
      luaSize: result.luaSize,
      cardLuaSize: result.cardLuaSize,
      defaultVars: result.defaultVars.numericCount,
    });
  }
}

function logFallback(reason) {
  if (typeof console !== 'undefined' && console.info) {
    console.info('[simbot] lua mining fallback', { reason: String(reason || '') });
  }
}

function countMatches(text, re) {
  return (String(text || '').match(re) || []).length;
}

function toBytes(x) {
  return x instanceof Uint8Array ? x : new Uint8Array(x);
}

function u16(b, off) {
  return b[off] | (b[off + 1] << 8);
}

function u32(b, off) {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}

function indexLocalHeader(b, start) {
  for (let i = start; i + 3 < b.length; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x03 && b[i + 3] === 0x04) return i;
  }
  return -1;
}

function textDecoder() {
  return new TextDecoder('utf-8');
}

module.exports = {
  mineCard,
  collectCardScripts,
  parseDefaultVariables,
  parseLuaTables,
  parseLuaConstants,
  parseValue,
  parseTable,
  parseNumberRange,
  normalizeRanges,
};
