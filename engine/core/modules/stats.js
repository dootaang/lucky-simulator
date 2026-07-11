'use strict';

const { tierOf } = require('../selectors.js');
const { clamp, clone, ladderById, normalizeInt, rankIndex, safeOwnKey, scaleById } = require('../utils.js');
const { scopedEvent } = require('./eventSupport.js');

function createStatsModule() {
  return {
    id: 'core.stats',
    version: '1.0.0',
    dependencies: [],
    stateAccess: {
      owns: ['player.level', 'player.exp', 'npcs.*.<scale>', 'npcs.*.<scale>DeltaToday', 'scaleMults.*', 'reputation.*'],
      reads: [],
      writes: [],
    },
    events: {
      scale_delta: scopedEvent(({ schema, state, params, ok, fail }) => scaleDelta(schema, state, params, ok, fail)),
      set_scale_mult: scopedEvent(({ schema, state, params, ok, fail }) => setScaleMult(schema, state, params, ok, fail)),
      rep_event: scopedEvent(({ schema, state, params, rng, ok, fail }) => repEvent(schema, state, params, rng, ok, fail)),
      exp_gain: scopedEvent(({ schema, state, params, rng, ok, fail }) => expGain(schema, state, params, rng, ok, fail)),
    },
    selectors: {
      'stats/tier': tierOf,
    },
    processes: {},
    migrations: {},
  };
}

function scaleDelta(schema, state, params, ok, fail) {
  const scaleId = params.scale || 'affinity';
  const target = params.target || params.npcId;
  const scale = scaleById(schema, scaleId);
  if (!scale) return fail('unknown_scale', scaleId);
  // safeOwnKey — '__proto__' 류 키의 프로토타입 오염 차단(감사 Critical). scale_delta는 LLM 노출 이벤트라 특히 중요.
  if (!target || !safeOwnKey(state.npcs, target)) return fail('unknown_target', target);

  const counterKey = `${scaleId}DeltaToday`;
  const cap = Number(scale.dailyCapPerTarget || scale.dailyCap || 0);
  const used = Number(state.npcs[target][counterKey] || 0);
  const before = Number(state.npcs[target][scaleId] || scale.default || 0);
  if (cap && used >= cap) return ok({ scale: scaleId, target, before, after: before, delta: 0, capped: true, reason: params.reason || '' });

  const size = params.size || 'S';
  const direction = params.direction === '-' ? '-' : '+';
  const key = direction === '-' ? `${size}-` : size;
  const base = Number(scale.steps && scale.steps[key]);
  if (!Number.isFinite(base)) return fail('unknown_scale_step', key);
  const bonusLimit = Math.abs(Number(scale.charBonus || 0));
  const charBonus = clamp(normalizeInt(params.charBonus, 0), -bonusLimit, bonusLimit);
  const multRaw = Number((state.scaleMults || {})[scaleId]);
  const mult = Number.isFinite(multRaw) && multRaw > 0 ? Math.min(3, Math.max(0.5, multRaw)) : 1;
  const rawDelta = Math.floor((base + charBonus) * mult + 0.5);
  const range = scale.range || [0, 200];
  const after = clamp(before + rawDelta, Number(range[0]), Number(range[1]));
  const fromTier = tierOf(schema, scaleId, before);
  const toTier = tierOf(schema, scaleId, after);

  state.npcs[target][scaleId] = after;
  state.npcs[target][counterKey] = used + 1;
  const entry = { scale: scaleId, target, before, after, delta: after - before, size, direction, charBonus, reason: params.reason || '' };
  if ((fromTier && fromTier.label) !== (toTier && toTier.label)) entry.tierChanged = { from: fromTier || null, to: toTier || null };
  return ok(entry);
}

function setScaleMult(schema, state, params, ok, fail) {
  const scale = params.scale;
  if (!scaleById(schema, scale)) return fail('unknown_scale', scale);
  const raw = params.mult;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fail('invalid_mult', params.mult);
  const mult = Math.round(Math.min(3, Math.max(0.5, raw)) * 10) / 10;
  state.scaleMults = state.scaleMults || {};
  const beforeRaw = Number(state.scaleMults[scale]);
  const before = Number.isFinite(beforeRaw) ? beforeRaw : 1;
  state.scaleMults[scale] = mult;
  return ok({ scale, before, mult });
}

function repEvent(schema, state, params, rng, ok, fail) {
  const ladder = ladderById(schema, 'reputation');
  const axis = params.axis;
  const category = params.category;
  if (!ladder || !ladder.axes.includes(axis)) return fail('unknown_reputation_axis', axis);
  const table = ladder.categories && ladder.categories[axis];
  const range = table && table[category];
  if (!range) return fail('unknown_reputation_category', `${axis}:${category}`);
  const delta = Array.isArray(range) ? rng.int(range[0], range[1]) : Number(range);
  const current = state.reputation[axis] || { rank: 'E', exp: 0 };
  const before = { rank: current.rank, exp: current.exp };
  let rank = current.rank;
  let exp = Number(current.exp || 0) + delta;
  let changed = null;

  if (delta >= 0) {
    const idx = rankIndex(ladder, rank);
    const next = (ladder.ranks || [])[idx];
    if (next && next.next != null && exp >= Number(next.next)) {
      const promoted = (ladder.ranks || [])[idx + 1];
      if (promoted) { changed = { from: rank, to: promoted.id, type: 'promote' }; rank = promoted.id; exp = 0; }
    }
  } else {
    while (exp < 0) {
      const idx = rankIndex(ladder, rank);
      if (idx <= 0) { rank = (ladder.floor && ladder.floor.rank) || 'E'; exp = Number((ladder.floor && ladder.floor.exp) || 0); break; }
      const previous = (ladder.ranks || [])[idx - 1];
      const previousThreshold = Number(previous.next || 0);
      changed = { from: rank, to: previous.id, type: 'demote' };
      rank = previous.id;
      exp = previousThreshold + exp;
    }
  }

  state.reputation[axis] = { rank, exp };
  return ok({ axis, category, delta, before, after: state.reputation[axis], rankChanged: changed, reason: params.reason || '' });
}

function expGain(schema, state, params, rng, ok, fail) {
  const ladder = ladderById(schema, 'player_level');
  if (!ladder) return fail('missing_player_level_ladder');
  const source = ladder.sources && ladder.sources[params.category];
  if (!source) return fail('unknown_exp_category', params.category);
  const amount = Array.isArray(source) ? rng.int(source[0], source[1]) : Number(source.value == null ? source : source.value);
  const before = { level: state.player.level, exp: state.player.exp };
  state.player.exp = Number(state.player.exp || 0) + amount;
  const levelUps = [];
  while (state.player.level <= (ladder.thresholds || []).length) {
    const threshold = Number(ladder.thresholds[state.player.level - 1]);
    if (!threshold || state.player.exp < threshold) break;
    state.player.exp -= threshold;
    state.player.level += 1;
    levelUps.push(state.player.level);
  }
  return ok({ category: params.category, amount, before, after: clone(state.player), levelUps, reason: params.reason || '' });
}

module.exports = { createStatsModule };
