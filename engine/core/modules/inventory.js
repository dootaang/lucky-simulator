'use strict';

const { poolHeal } = require('../pools.js');
const { availableMenu, usableItems, menuTrade } = require('../selectors.js');
const { findMenu, normalizeInt, safeOwnKey } = require('../utils.js');
const { scopedEvent } = require('./eventSupport.js');

function createInventoryModule() {
  return {
    id: 'core.inventory',
    version: '1.0.0',
    dependencies: ['core.stats'],
    stateAccess: {
      owns: ['resources.*', 'items.*'],
      // use_item이 사망 여부와 풀 잔량을 읽는다(감사 지적: 실제 읽기 경로 빠짐없이 선언).
      reads: ['combat.active', 'player.dead', 'player.pools.*'],
      writes: ['gold', 'player.pools.*'],
    },
    events: {
      gain_resource: scopedEvent(({ schema, state, params, rng, ok, fail }) => gainResource(schema, state, params, rng, ok, fail)),
      resource_delta: scopedEvent(({ state, params, ok, fail }) => resourceDelta(state, params, ok, fail)),
      use_item: scopedEvent(({ schema, state, params, ok, fail }) => useItem(schema, state, params, ok, fail)),
      buy_item: scopedEvent(({ schema, state, params, ok, fail }) => buyItem(schema, state, params, ok, fail)),
      purchase: scopedEvent(({ schema, state, params, ok, fail }) => purchase(schema, state, params, ok, fail)),
      purchase_batch: scopedEvent(({ schema, state, params, ok, fail }) => purchaseBatch(schema, state, params, ok, fail)),
    },
    selectors: {
      'inventory/usable-items': usableItems,
      'inventory/available-menu': availableMenu,
    },
    processes: {},
    migrations: {},
  };
}

function useItem(schema, state, params, ok, fail) {
  if (Object.entries(params).some(([key, value]) => key !== 'itemId' && (['amount', 'heal', 'hp', 'mp', 'sp'].includes(key) || (value !== '' && Number.isFinite(Number(value)))))) return fail('item_number_not_allowed');
  const itemId = params.itemId;
  const item = (schema.resources || []).find((resource) => resource.id === itemId && resource.effect);
  if (!item) return fail('unknown_item', itemId);
  const count = Number((state.resources && state.resources[itemId]) || 0);
  if (count < 1) return fail('out_of_stock', itemId);
  if (state.player && state.player.dead) return fail('player_dead');
  const pool = state.player && state.player.pools && state.player.pools[item.effect.pool];
  if (!pool) return fail('no_pool', item.effect.pool);
  const before = Number(pool.cur);
  if (before >= Number(pool.max)) return fail('pool_full', item.effect.pool);
  const healed = poolHeal(pool, item.effect.amount);
  state.player.pools[item.effect.pool] = healed;
  state.resources[itemId] = count - 1;
  return ok({ itemId, pool: item.effect.pool, amount: healed.cur - before, before, after: healed.cur, remaining: state.resources[itemId] });
}

function gainResource(schema, state, params, rng, ok, fail) {
  const resource = params.resource || params.resourceId;
  // `in` 검사는 프로토타입 상속 키('__proto__'·'constructor')를 통과시킨다 — 소유 키만 인정(감사 Critical).
  if (!resource || !safeOwnKey(state.resources, resource)) return fail('unknown_resource', resource);
  const table = (schema && schema.gather) || {};
  const requestedScale = params.scale || 'small';
  const scale = table[requestedScale] ? requestedScale : 'small';
  const range = table[scale];
  if (!isNumberRange(range)) return fail('unknown_gather_scale', scale);
  const qty = rng.int(range[0], range[1]);
  const before = Number(state.resources[resource] || 0);
  state.resources[resource] = before + qty;
  return ok({ resource, qty, scale, before, after: state.resources[resource], reason: params.reason || '' });
}

function resourceDelta(state, params, ok, fail) {
  const resource = params.resource || params.resourceId;
  const amount = normalizeInt(params.amount);
  // `in` 검사는 프로토타입 상속 키('__proto__'·'constructor')를 통과시킨다 — 소유 키만 인정(감사 Critical).
  if (!resource || !safeOwnKey(state.resources, resource)) return fail('unknown_resource', resource);
  const before = Number(state.resources[resource] || 0);
  state.resources[resource] = Math.max(0, before + amount);
  return ok({ resource, amount, before, after: state.resources[resource], reason: params.reason || '' });
}

function buyItem(schema, state, params, ok, fail) {
  if (state.combat && state.combat.active) return fail('in_combat');
  if (Object.keys(params).some((key) => !['menuName', 'qty'].includes(key))) return fail('item_number_not_allowed');
  const menu = findMenu(schema, params.menuName);
  if (!menu) return fail('unknown_menu', params.menuName);
  if (menuTrade(menu) !== 'buy') return fail('menu_not_buyable', params.menuName);
  const qty = normalizeInt(params.qty, 1);
  if (qty <= 0 || qty > 999) return fail('invalid_qty', qty);
  const cost = Number(menu.price || 0) * qty;
  if (Number(state.gold || 0) < cost) return fail('insufficient_gold', params.menuName);
  state.gold = Number(state.gold || 0) - cost;
  if (!state.items || typeof state.items !== 'object') state.items = {};
  state.items[menu.name] = Number(state.items[menu.name] || 0) + qty;
  return ok({ menuName: menu.name, qty, goldDelta: -cost, owned: state.items[menu.name] });
}

function purchase(schema, state, params, ok, fail) {
  if (state.combat && state.combat.active) return fail('in_combat');
  const resource = params.resource || params.resourceId;
  const qty = normalizeInt(params.qty, 1);
  const def = (schema.resources || []).find((entry) => entry.id === resource);
  if (!def || resource === 'gold') return fail('unknown_resource', resource);
  if (qty <= 0 || qty > 999) return fail('invalid_qty', qty);
  const cost = Number(def.basePrice || 0) * qty;
  if (state.gold < cost) return fail('insufficient_gold', resource);
  state.gold -= cost;
  state.resources[resource] = Number(state.resources[resource] || 0) + qty;
  return ok({ resource, qty, goldDelta: -cost });
}

function purchaseBatch(schema, state, params, ok, fail) {
  if (state.combat && state.combat.active) return fail('in_combat');
  const items = Array.isArray(params.items) ? params.items : [];
  if (!items.length) return fail('empty_purchase_batch');
  const normalized = [];
  let total = 0;
  for (const item of items) {
    const resource = item && (item.resource || item.resourceId);
    const qty = normalizeInt(item && item.qty, 0);
    const def = (schema.resources || []).find((entry) => entry.id === resource);
    if (!def || resource === 'gold') return fail('unknown_resource', resource);
    if (qty <= 0 || qty > 999) return fail('invalid_qty', qty);
    const cost = Number(def.basePrice || 0) * qty;
    total += cost;
    normalized.push({ resource, qty, cost });
  }
  if (Number(state.gold || 0) < total) return fail('insufficient_gold', total);
  state.gold = Number(state.gold || 0) - total;
  for (const item of normalized) state.resources[item.resource] = Number(state.resources[item.resource] || 0) + item.qty;
  return ok({ items: normalized, goldDelta: -total });
}

function isNumberRange(range) {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const min = Number(range[0]);
  const max = Number(range[1]);
  return Number.isFinite(min) && Number.isFinite(max) && max >= min;
}

module.exports = { createInventoryModule };
