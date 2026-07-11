'use strict';

const { clone } = require('./utils.js');

class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.events = new Map();
    this.selectors = new Map();
    this.processes = new Map();
    this.stateOwners = new Map();
  }

  register(definition) {
    const module = normalizeModule(definition);
    if (this.modules.has(module.id)) throw new Error(`duplicate_module:${module.id}`);
    for (const dependency of module.dependencies) {
      if (!this.modules.has(dependency)) throw new Error(`missing_module_dependency:${module.id}:${dependency}`);
    }
    assertRoutesAvailable(this.events, module.events, 'event');
    assertRoutesAvailable(this.selectors, module.selectors, 'selector');
    assertRoutesAvailable(this.processes, module.processes, 'process');
    for (const path of module.stateAccess.owns) {
      const owner = this.stateOwners.get(path);
      if (owner) throw new Error(`duplicate_state_owner:${path}:${owner}`);
    }

    this.modules.set(module.id, module);
    registerRoutes(this.events, module, module.events);
    registerRoutes(this.selectors, module, module.selectors);
    registerRoutes(this.processes, module, module.processes);
    for (const path of module.stateAccess.owns) this.stateOwners.set(path, module.id);
    return this;
  }

  dispatch(schema, state, event, rng) {
    const type = event && event.id;
    const route = this.events.get(type);
    if (!route) return unknownEvent(state, type);
    const workingState = clone(state);
    const rngSnapshot = snapshotRng(rng);
    let result;
    try {
      result = route.handler({
        schema,
        state: workingState,
        event,
        params: (event && event.params) || event || {},
        rng,
        registry: this,
        module: route.module,
      });
    } catch (error) {
      restoreRng(rng, rngSnapshot);
      return moduleFailure(state, type, 'module_exception', error && error.message);
    }
    if (!validResult(result)) {
      restoreRng(rng, rngSnapshot);
      return moduleFailure(state, type, 'module_contract', 'Module must return { state, log[] }.');
    }
    if (!result.log.some((entry) => entry && entry.ok === true)) {
      restoreRng(rng, rngSnapshot);
      return { state, log: result.log };
    }
    return result;
  }

  select(id, ...args) {
    const route = this.selectors.get(id);
    if (!route) throw new Error(`unknown_selector:${id}`);
    return route.handler(...args);
  }

  runProcess(id, ...args) {
    const route = this.processes.get(id);
    if (!route) throw new Error(`unknown_process:${id}`);
    return route.handler(...args);
  }

  eventIds() { return Array.from(this.events.keys()); }
  selectorIds() { return Array.from(this.selectors.keys()); }
  processIds() { return Array.from(this.processes.keys()); }
  hasEvent(id) { return this.events.has(id); }
  eventOwner(id) { const route = this.events.get(id); return route ? route.module.id : null; }
  selectorOwner(id) { const route = this.selectors.get(id); return route ? route.module.id : null; }
  processOwner(id) { const route = this.processes.get(id); return route ? route.module.id : null; }
  stateOwner(path) { return this.stateOwners.get(path) || null; }
  getModule(id) { return this.modules.get(id) || null; }
  listModules() {
    return Array.from(this.modules.values()).map((module) => ({
      id: module.id,
      version: module.version,
      dependencies: module.dependencies.slice(),
      eventIds: Object.keys(module.events),
      selectorIds: Object.keys(module.selectors),
      processIds: Object.keys(module.processes),
      stateAccess: {
        owns: module.stateAccess.owns.slice(),
        reads: module.stateAccess.reads.slice(),
        writes: module.stateAccess.writes.slice(),
      },
    }));
  }
}

function normalizeModule(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('invalid_module');
  const id = String(definition.id || '').trim();
  const version = String(definition.version || '').trim();
  if (!id) throw new TypeError('missing_module_id');
  if (!version) throw new TypeError(`missing_module_version:${id}`);
  const dependencies = Array.isArray(definition.dependencies)
    ? Array.from(new Set(definition.dependencies.map((value) => String(value).trim()).filter(Boolean)))
    : [];
  return Object.freeze({
    id,
    version,
    dependencies,
    events: normalizeRoutes(definition.events, id, 'event'),
    selectors: normalizeRoutes(definition.selectors, id, 'selector'),
    processes: normalizeRoutes(definition.processes, id, 'process'),
    stateAccess: normalizeStateAccess(definition.stateAccess),
    initialState: typeof definition.initialState === 'function' ? definition.initialState : null,
    promptFacts: typeof definition.promptFacts === 'function' ? definition.promptFacts : null,
    migrations: definition.migrations || {},
  });
}

function normalizeStateAccess(access) {
  const source = access && typeof access === 'object' ? access : {};
  return Object.freeze({
    owns: normalizePaths(source.owns),
    reads: normalizePaths(source.reads),
    writes: normalizePaths(source.writes),
  });
}

function normalizePaths(paths) {
  return Array.isArray(paths) ? Array.from(new Set(paths.map((path) => String(path).trim()).filter(Boolean))) : [];
}

function normalizeRoutes(routes, moduleId, kind) {
  if (routes == null) return {};
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) throw new TypeError(`invalid_${kind}_routes:${moduleId}`);
  const normalized = {};
  for (const [id, handler] of Object.entries(routes)) {
    const routeId = String(id || '').trim();
    if (!routeId || typeof handler !== 'function') throw new TypeError(`invalid_${kind}_handler:${moduleId}:${routeId}`);
    normalized[routeId] = handler;
  }
  return Object.freeze(normalized);
}

function assertRoutesAvailable(registry, routes, kind) {
  for (const id of Object.keys(routes)) {
    const existing = registry.get(id);
    if (existing) throw new Error(`duplicate_${kind}:${id}:${existing.module.id}`);
  }
}

function registerRoutes(registry, module, routes) {
  for (const [id, handler] of Object.entries(routes)) registry.set(id, { module, handler });
}

function unknownEvent(state, type) {
  return { state, log: [{ ok: false, event: type, reason: 'unknown_event', detail: `Unknown event id: ${type}` }] };
}

function snapshotRng(rng) {
  return rng && typeof rng.snapshot === 'function' && typeof rng.restore === 'function'
    ? { supported: true, value: rng.snapshot() }
    : { supported: false };
}

function restoreRng(rng, snapshot) {
  if (snapshot && snapshot.supported) rng.restore(snapshot.value);
}

function validResult(result) {
  return !!result && typeof result === 'object'
    && result.state != null && typeof result.state === 'object'
    && Array.isArray(result.log) && result.log.length > 0
    && result.log.every((entry) => entry && typeof entry === 'object' && typeof entry.ok === 'boolean');
}

function moduleFailure(state, type, reason, detail) {
  return { state, log: [{ ok: false, event: type, reason, ...(detail ? { detail: String(detail) } : {}) }] };
}

module.exports = { ModuleRegistry, unknownEvent };
