'use strict';

// HP/MP/SP 등 풀 자원. pool = { cur, max }. 전부 순수(새 객체 반환).
// 엔진이 원장을 소유해 clamp·고갈·사망을 강제한다 → LLM이 HP를 잊거나 부활시키거나
// 없는 MP를 쓸 수 없다.

function normalizePool(value) {
  if (value && typeof value === 'object') {
    const max = num(value.max, num(value.cur, 0));
    const cur = clamp(num(value.cur, max), 0, max);
    return { cur, max };
  }
  const max = num(value, 0);
  return { cur: max, max };
}

function poolDamage(pool, n) {
  const p = normalizePool(pool);
  return { cur: clamp(p.cur - Math.max(0, num(n, 0)), 0, p.max), max: p.max };
}

function poolHeal(pool, n) {
  const p = normalizePool(pool);
  return { cur: clamp(p.cur + Math.max(0, num(n, 0)), 0, p.max), max: p.max };
}

// 비용 차감. 잔량 부족이면 null(거부 신호).
function poolSpend(pool, n) {
  const p = normalizePool(pool);
  const cost = Math.max(0, num(n, 0));
  if (p.cur < cost) return null;
  return { cur: p.cur - cost, max: p.max };
}

function poolRestore(pool) {
  const p = normalizePool(pool);
  return { cur: p.max, max: p.max };
}

function isDead(pool) {
  return normalizePool(pool).cur <= 0;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

module.exports = { normalizePool, poolDamage, poolHeal, poolSpend, poolRestore, isDead };
