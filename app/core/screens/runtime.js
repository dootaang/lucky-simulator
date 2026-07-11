// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const ALLOWED_OPS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'truthy', 'includes']);

function normalizeScreens(screens, navigation) {
  const issues = []; const ids = new Set(); const normalized = [];
  for (const [index, raw] of (Array.isArray(screens) ? screens : []).entries()) {
    if (!raw || typeof raw !== 'object') { issues.push({ path: `screens[${index}]`, reason: 'not_object' }); continue; }
    const id = String(raw.id || `screen-${index}`);
    if (ids.has(id)) { issues.push({ path: `screens[${index}].id`, reason: 'duplicate' }); continue; }
    ids.add(id);
    const regions = Array.isArray(raw.regions)
      ? { main: raw.regions }
      : raw.regions && typeof raw.regions === 'object' ? raw.regions : {};
    normalized.push({ id, title: String(raw.title || id), layout: String(raw.layout || 'dashboard'), presentation: ['page', 'modal', 'overlay'].includes(raw.presentation) ? raw.presentation : 'page', visibleWhen: raw.visibleWhen || null, regions });
  }
  const nav = (Array.isArray(navigation) ? navigation : []).filter((item) => item && ids.has(item.screenId)).map((item, index) => ({ id: String(item.id || `nav-${index}`), screenId: String(item.screenId), label: String(item.label || item.screenId), visibleWhen: item.visibleWhen || null }));
  return { screens: normalized, navigation: nav, issues };
}

function evaluateCondition(node, context) {
  if (node == null) return true;
  if (typeof node === 'boolean') return node;
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (Array.isArray(node.all)) return node.all.every((part) => evaluateCondition(part, context));
  if (Array.isArray(node.any)) return node.any.some((part) => evaluateCondition(part, context));
  if (node.not != null) return !evaluateCondition(node.not, context);
  const op = String(node.op || 'truthy');
  if (!ALLOWED_OPS.has(op) || typeof node.path !== 'string') return false;
  const left = safePath(context, node.path); const right = node.value;
  if (op === 'truthy') return !!left;
  if (op === 'eq') return left === right; if (op === 'ne') return left !== right;
  if (op === 'gt') return Number(left) > Number(right); if (op === 'gte') return Number(left) >= Number(right);
  if (op === 'lt') return Number(left) < Number(right); if (op === 'lte') return Number(left) <= Number(right);
  if (op === 'includes') return Array.isArray(left) ? left.includes(right) : String(left || '').includes(String(right || ''));
  return false;
}

function selectScreenData(source, context, selectors = {}) {
  if (!source) return null;
  if (typeof source === 'object') return clone(source);
  const key = String(source);
  if (typeof selectors[key] === 'function') return selectors[key](context);
  if (key.startsWith('state.') || key.startsWith('schema.') || key.startsWith('content.') || key.startsWith('selection.')) return clone(safePath(context, key));
  return null;
}

function resolveEvent(action, context) {
  if (!action || typeof action !== 'object' || typeof action.id !== 'string' || !action.id.trim()) return null;
  return { id: action.id.trim(), params: resolveValue(action.params || {}, context) };
}

function resolveValue(value, context) {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (!value || typeof value !== 'object') return value;
  if (typeof value.$path === 'string') return clone(safePath(context, value.$path));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, context)]));
}

function safePath(root, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part) || !current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

module.exports = { ALLOWED_OPS, normalizeScreens, evaluateCondition, selectScreenData, resolveEvent, safePath };

