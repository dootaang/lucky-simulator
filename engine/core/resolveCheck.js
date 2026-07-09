'use strict';

// 범용 시드 판정 primitive. 전투 명중·스킬 + 비전투 스킬체크(설득·흥정·의뢰) 공용.
// 아카라이브 🎲Dice·⚖️Choice 모듈 판정 규칙을 정확히 재현하되, 비시드 math.random 대신
// 시드 rng를 써서 재현·골든 가능(상위호환). 크레딧: 배포 글 마지막 줄.
//
// 반환: { mode, rand, total, success, tier }
//   tier ∈ 'critical_success' | 'success' | 'failure' | 'critical_failure'

function resolveCheck(rng, spec) {
  const mode = spec && spec.mode === 'rate' ? 'rate' : 'dc';
  return mode === 'rate' ? rateCheck(rng, spec) : dcCheck(rng, spec);
}

// DC 모드: dN + mod vs DC. 크리 = 자연 최대(rand===sides) / 자연 1. (Dice 모듈 규칙)
function dcCheck(rng, spec) {
  const sides = intOr(spec.sides, 20);
  const dc = intOr(spec.dc, 10);
  const mod = intOr(spec.mod, 0);
  const rand = rng.int(1, Math.max(1, sides));
  const total = rand + mod;
  const success = total >= dc;
  let tier;
  if (success) tier = rand === sides ? 'critical_success' : 'success';
  else tier = rand === 1 ? 'critical_failure' : 'failure';
  return { mode: 'dc', rand, total, success, tier };
}

// 확률 모드: d100 vs 성공률%. 크리성공 = 낮은 굴림(≤5), 크리실패 = 높은 굴림(≥95). (Choice dr 규칙)
function rateCheck(rng, spec) {
  const rate = clampInt(spec.rate, 0, 100, 50);
  const rand = rng.int(1, 100);
  const success = rand <= rate;
  let tier;
  if (success) tier = rand <= 5 ? 'critical_success' : 'success';
  else tier = rand >= 95 ? 'critical_failure' : 'failure';
  return { mode: 'rate', rand, total: rand, success, tier };
}

function intOr(value, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, lo, hi, fallback) {
  const n = intOr(value, fallback);
  return Math.min(hi, Math.max(lo, n));
}

module.exports = { resolveCheck };
