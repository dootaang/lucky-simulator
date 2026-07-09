'use strict';

// 결정론 후패치: LLM이 만든 스키마 위에, 카드 Lua에서 채굴한 정확한 숫자를
// 강제로 덮어쓴다. LLM은 서사·구조 번역만 맡고, 경제 핵심 수치(보상·업그레이드비·문턱)는
// 코드가 소유한다 → LLM이 뭐라 쓰든 숫자는 무조건 카드 실값이 되어 환각이 구조적으로 불가능.
//
// 원칙:
//  - 채굴 테이블 이름을 하드코딩하지 않는다. 스키마 필드와의 "모양 대응"으로 소스를 찾는다(카드 일반화).
//  - LLM이 이미 만든 필드의 숫자만 교정한다. 없던 구조를 새로 지어내지 않는다(보상표는 예외 — 고가치).
//  - 모든 덮어쓰기를 patches 로그로 남긴다(검수 UI 투명성). 패치 후 validateSchema가 재검증한다.

const RANK_KEYS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'EX'];

function patchSchemaWithMined(schema, mined) {
  const patches = [];
  const tables = mined && mined.tables;
  if (!schema || typeof schema !== 'object' || !tables || !Object.keys(tables).length) {
    return { schema, patches };
  }
  patchRewardGold(schema, tables, patches);
  patchUpgradeCosts(schema, tables, patches);
  patchThresholds(schema, tables, patches);
  return { schema, patches };
}

// rewards.gold ← 랭크별 pay/reward 범위 테이블(예: MAIL_RANK_GUIDE.questPay)
function patchRewardGold(schema, tables, patches) {
  const source = findRankPayTable(tables);
  if (!source) return;
  if (!schema.rewards || typeof schema.rewards !== 'object') schema.rewards = {};
  if (!schema.rewards.gold || typeof schema.rewards.gold !== 'object') schema.rewards.gold = {};
  const gold = schema.rewards.gold;
  for (const rank of Object.keys(source.byRank)) {
    const value = source.byRank[rank];
    if (!sameArray(gold[rank], value)) {
      patches.push({ path: `rewards.gold.${rank}`, from: cloneVal(gold[rank]), to: cloneVal(value) });
      gold[rank] = value.slice();
    }
  }
}

// facility.upgradeCosts ← {facilityId:[c2,c3,c4]} 형태 테이블
function patchUpgradeCosts(schema, tables, patches) {
  const facility = findEntity(schema, 'facility');
  if (!facility || !Array.isArray(facility.instances)) return;
  const ids = facility.instances.map((inst) => inst && inst.id).filter(Boolean);
  const source = findCostTable(tables, ids);
  if (!source) return;
  for (const inst of facility.instances) {
    if (!inst || !inst.id) continue;
    const arr = source[inst.id];
    if (!Array.isArray(arr) || !arr.every((n) => typeof n === 'number')) continue;
    const next = {};
    for (let i = 0; i < arr.length; i++) next[String(i + 2)] = arr[i]; // index 0 → 레벨2 비용
    if (!sameObject(inst.upgradeCosts, next)) {
      patches.push({ path: `facility(${inst.id}).upgradeCosts`, from: cloneVal(inst.upgradeCosts), to: cloneVal(next) });
      inst.upgradeCosts = next;
    }
  }
}

// ladder thresholds / ranks.next ← 오름차순 문턱 배열(예: rankThresholds)
// LLM이 이미 같은 카디널리티로 만든 필드만 교정한다(구조 조작 방지).
function patchThresholds(schema, tables, patches) {
  const thr = findThresholdArray(tables);
  if (!thr) return;
  const ladders = Array.isArray(schema.ladders) ? schema.ladders : [];
  for (const ladder of ladders) {
    if (!ladder || typeof ladder !== 'object') continue;
    if (Array.isArray(ladder.thresholds) && ladder.thresholds.length === thr.length && !sameArray(ladder.thresholds, thr)) {
      patches.push({ path: `ladder(${ladder.id || '?'}).thresholds`, from: cloneVal(ladder.thresholds), to: cloneVal(thr) });
      ladder.thresholds = thr.slice();
    }
    if (Array.isArray(ladder.ranks) && ladder.ranks.length === thr.length + 1) {
      let changed = false;
      const before = ladder.ranks.map((r) => (r ? r.next : undefined));
      ladder.ranks.forEach((rank, i) => {
        if (!rank || typeof rank !== 'object') return;
        const want = i < thr.length ? thr[i] : null;
        if (rank.next !== want) { rank.next = want; changed = true; }
      });
      if (changed) {
        patches.push({ path: `ladder(${ladder.id || '?'}).ranks[].next`, from: cloneVal(before), to: ladder.ranks.map((r) => (r ? r.next : null)) });
      }
    }
  }
}

// --- 소스 탐색 (모양 기반) ---

// 랭크로 키가 매겨진 객체 테이블 중, 각 랭크 값에 [min,max] 숫자 범위 필드가 있는 걸 찾는다.
function findRankPayTable(tables) {
  let best = null;
  for (const name of Object.keys(tables)) {
    const t = tables[name];
    if (!isPlainObject(t)) continue;
    const rankKeys = Object.keys(t).filter((k) => isRank(k) && isPlainObject(t[k]));
    if (rankKeys.length < 2) continue;
    const field = pickPayField(t, rankKeys);
    if (!field) continue;
    const byRank = {};
    for (const k of rankKeys) {
      const v = t[k][field];
      if (isNumberRange(v)) byRank[normalizeRank(k)] = v;
    }
    const score = Object.keys(byRank).length + (/pay|reward|gold/i.test(field) ? 1 : 0);
    if (Object.keys(byRank).length >= 2 && (!best || score > best.score)) best = { byRank, score };
  }
  return best;
}

// 랭크 값들에 공통으로 존재하는 필드 중, 값이 [min,max] 숫자 범위이고 이름이 pay/reward/gold에
// 가장 잘 맞는 필드를 고른다.
function pickPayField(table, rankKeys) {
  const counts = {};
  for (const k of rankKeys) {
    const entry = table[k];
    for (const f of Object.keys(entry)) {
      if (isNumberRange(entry[f])) counts[f] = (counts[f] || 0) + 1;
    }
  }
  const candidates = Object.keys(counts).filter((f) => counts[f] >= Math.min(2, rankKeys.length));
  if (!candidates.length) return null;
  candidates.sort((a, b) => rankFieldScore(b) - rankFieldScore(a) || counts[b] - counts[a]);
  return candidates[0];
}

function rankFieldScore(name) {
  if (/pay/i.test(name)) return 3;
  if (/gold/i.test(name)) return 2;
  if (/reward/i.test(name)) return 1;
  return 0;
}

// facility id를 키로 갖고 값이 숫자 배열인 테이블. 이름에 upgrade/cost가 있으면 가점.
function findCostTable(tables, facilityIds) {
  const idSet = new Set(facilityIds);
  let best = null;
  for (const name of Object.keys(tables)) {
    const t = tables[name];
    if (!isPlainObject(t)) continue;
    const hitKeys = Object.keys(t).filter((k) => idSet.has(k) && isNumberArray(t[k]));
    if (hitKeys.length < 2) continue;
    const score = hitKeys.length + (/upgrade|cost/i.test(name) ? 2 : 0);
    if (!best || score > best.score) best = { table: t, score };
  }
  return best ? best.table : null;
}

// 오름차순 양수 배열이면서 이름에 threshold/next/rank가 들어간 걸 우선.
function findThresholdArray(tables) {
  let best = null;
  for (const name of Object.keys(tables)) {
    const t = tables[name];
    if (!isNumberArray(t) || t.length < 2) continue;
    if (!isAscendingPositive(t)) continue;
    const score = (/threshold/i.test(name) ? 3 : 0) + (/next|rank|level/i.test(name) ? 1 : 0);
    if (score === 0) continue; // 이름 힌트 없는 임의 숫자배열은 문턱으로 오인하지 않는다
    if (!best || score > best.score) best = { arr: t, score };
  }
  return best ? best.arr : null;
}

// --- 헬퍼 ---

function findEntity(schema, type) {
  const list = Array.isArray(schema.entities) ? schema.entities : [];
  return list.find((e) => e && e.type === type) || null;
}

function isRank(key) {
  return RANK_KEYS.includes(String(key).toUpperCase().replace(/[+\s].*$/, ''));
}

function normalizeRank(key) {
  return String(key).toUpperCase().replace(/[+\s].*$/, '');
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !v.__ref;
}

function isNumberRange(v) {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isNumberArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isAscendingPositive(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] <= 0) return false;
    if (i > 0 && arr[i] <= arr[i - 1]) return false;
  }
  return true;
}

function sameArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function sameObject(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function cloneVal(v) {
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}

module.exports = { patchSchemaWithMined };
