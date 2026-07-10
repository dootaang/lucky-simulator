'use strict';

const { resolveCheck } = require('./resolveCheck.js');
const { normalizePool, poolDamage, poolSpend, isDead } = require('./pools.js');
const { ladderById } = require('./utils.js');

// 전투 인카운터. 원장·판정·사망은 전부 엔진 소유. LLM은 의도(공격/스킬/방어/도주 + 대상)와
// 시작 시 적 명부만 제안하고, 그 명부는 freeze되어 전투 중 재수정 불가. 수치는 엔진이 시드로.

function combatConfig(schema) {
  const c = (schema && schema.combat) || {};
  return {
    d: intOr(c.d, 20),
    minDamage: intOr(c.minDamage, 1),
    critMult: numOr(c.critMult, 2),
    guardMult: numOr(c.guardMult, 0.5),
    fleeRate: intOr(c.fleeRate, 50),
    expTable: c.expTable || {},
    lootGold: c.lootGold || {},
  };
}

function playerCombat(state) {
  const p = state.player || {};
  return {
    atk: intOr(p.atk, 5),
    def: intOr(p.def, 0),
    evade: intOr(p.evade, 10),
    acc: intOr(p.acc, 0),
  };
}

function hasNumberParam(params) {
  return ['power', 'damage', 'dmg', 'roll', 'amount', 'hp'].some((k) => k in (params || {}));
}

function startEncounter(schema, state, params, rng, ok, fail) {
  if (state.combat && state.combat.active) return fail('encounter_active');
  const roster = Array.isArray(params.enemies) ? params.enemies : [];
  if (!roster.length) return fail('no_enemies');
  const enemies = [];
  for (let i = 0; i < roster.length; i++) {
    const e = roster[i] || {};
    const hp = intOr(e.hp, 0);
    if (hp <= 0) return fail('invalid_enemy_hp', e.name || `e${i + 1}`);
    enemies.push({
      id: `e${i + 1}`,
      name: String(e.name || `적 ${i + 1}`),
      rank: e.rank != null ? String(e.rank) : null,
      hp: { cur: hp, max: hp },
      atk: intOr(e.atk, 5),
      def: intOr(e.def, 0),
      evade: intOr(e.evade, 10),
      acc: intOr(e.acc, 0),
      dead: false,
    });
  }
  state.combat = { active: true, round: 1, enemies, guard: false, cleared: false, fled: false };
  return ok({ enemies: enemies.map(publicEnemy) });
}

function combatAction(schema, state, params, rng, ok, fail) {
  const combat = state.combat;
  if (!combat || !combat.active) return fail('no_encounter');
  if (hasNumberParam(params)) return fail('combat_number_not_allowed');
  const action = params.action;
  if (action === 'defend') {
    combat.guard = true;
    return ok({ action, guard: true });
  }
  if (action === 'flee') {
    const cfg = combatConfig(schema);
    const check = resolveCheck(rng, { mode: 'rate', rate: cfg.fleeRate });
    if (check.success) {
      combat.active = false;
      combat.fled = true;
    }
    return ok({ action, check, fled: check.success });
  }
  if (action !== 'attack' && action !== 'skill') return fail('unknown_combat_action', action);

  const enemy = findEnemy(combat, params.target);
  if (!enemy) return fail('unknown_target', params.target);
  if (enemy.dead) return fail('target_dead', enemy.id);

  const cfg = combatConfig(schema);
  const pc = playerCombat(state);
  let skill = null;
  if (action === 'skill') {
    skill = (schema.skills || {})[params.skill];
    if (!skill) return fail('unknown_skill', params.skill);
    const poolId = skill.pool || 'mp';
    const pool = state.player.pools && state.player.pools[poolId];
    const spent = poolSpend(pool, skill.cost || 0);
    if (spent === null) return fail(`insufficient_${poolId}`, params.skill);
    state.player.pools[poolId] = spent;
  }

  const skillPower = intOr(skill && skill.power, 0);
  const skillAcc = intOr(skill && skill.acc, 0);
  const hit = resolveCheck(rng, { mode: 'dc', sides: cfg.d, dc: enemy.evade, mod: pc.acc + skillAcc });
  let dmg = 0;
  if (hit.success) {
    const base = pc.atk + skillPower;
    dmg = Math.max(cfg.minDamage, base - enemy.def);
    if (hit.tier === 'critical_success') dmg = Math.round(dmg * cfg.critMult);
    enemy.hp = poolDamage(enemy.hp, dmg);
    if (isDead(enemy.hp)) enemy.dead = true;
  }
  if (combat.enemies.every((e) => e.dead)) combat.cleared = true;

  return ok({
    action, skill: params.skill || null, target: enemy.id,
    hit: hit.success, tier: hit.tier, roll: hit.rand, damage: dmg,
    enemy: publicEnemy(enemy), cleared: combat.cleared,
  });
}

function enemyAction(schema, state, params, rng, ok, fail) {
  const combat = state.combat;
  if (!combat || !combat.active) return fail('no_encounter');
  if (hasNumberParam(params)) return fail('combat_number_not_allowed');
  const enemy = findEnemy(combat, params.enemyId);
  if (!enemy) return fail('unknown_enemy', params.enemyId);
  if (enemy.dead) return fail('enemy_dead', enemy.id);

  const skill = params.skill ? (schema.skills || {})[params.skill] : null;
  const result = resolveEnemyAttack(schema, state, enemy, skill, rng);
  combat.guard = false; // 기존 enemy_action 의미: 시도 1회에 소모
  return ok(Object.assign({
    enemyId: enemy.id, action: params.action || 'attack', skill: params.skill || null,
  }, result));
}

function enemyTurn(schema, state, params, rng, ok, fail) {
  const combat = state.combat;
  if (!combat) return fail('no_encounter');
  if (combat.cleared || combat.fled) return ok({ results: [], playerHp: normalizePool(state.player.pools && state.player.pools.hp), playerDead: !!state.player.dead });
  if (!combat.active) return fail('no_encounter');
  const results = [];
  for (const enemy of combat.enemies || []) {
    if (enemy.dead || Number(enemy.hp && enemy.hp.cur) <= 0) continue;
    const result = resolveEnemyAttack(schema, state, enemy, null, rng);
    results.push({ enemyId: enemy.id, hit: result.hit, tier: result.tier, roll: result.roll, damage: result.damage });
    if (result.hit) combat.guard = false; // 첫 피격이 방어를 소모(반감은 1회만)
    if (result.playerDead) break;
  }
  // 방어는 이번 적 턴까지만 유효 — 전원이 빗나가도 다음 턴으로 이월되지 않는다(감사 지적: 영구 방어 악용 방지).
  combat.guard = false;
  return ok({ results, playerHp: normalizePool(state.player.pools && state.player.pools.hp), playerDead: !!state.player.dead });
}

function resolveEnemyAttack(schema, state, enemy, skill, rng) {
  const combat = state.combat;
  const cfg = combatConfig(schema);
  const pc = playerCombat(state);
  const hit = resolveCheck(rng, { mode: 'dc', sides: cfg.d, dc: pc.evade, mod: enemy.acc + intOr(skill && skill.acc, 0) });
  let damage = 0;
  if (hit.success) {
    damage = Math.max(cfg.minDamage, enemy.atk + intOr(skill && skill.power, 0) - pc.def);
    if (hit.tier === 'critical_success') damage = Math.round(damage * cfg.critMult);
    if (combat.guard) damage = Math.max(0, Math.floor(damage * cfg.guardMult));
    const hp = (state.player.pools && state.player.pools.hp) || { cur: 0, max: 0 };
    state.player.pools.hp = poolDamage(hp, damage);
    if (isDead(state.player.pools.hp)) state.player.dead = true;
  }
  return { hit: hit.success, tier: hit.tier, roll: hit.rand, damage, playerHp: normalizePool(state.player.pools && state.player.pools.hp), playerDead: !!state.player.dead };
}

function endEncounter(schema, state, params, rng, ok, fail) {
  const combat = state.combat;
  if (!combat) return fail('no_encounter_to_end');
  if (combat.active && !combat.cleared && !combat.fled) return fail('encounter_unresolved');

  const cfg = combatConfig(schema);
  let expGained = 0;
  let goldGained = 0;
  const levelUps = [];
  if (combat.cleared) {
    for (const enemy of combat.enemies) {
      const expRange = cfg.expTable[enemy.rank] || cfg.expTable.default;
      if (isRange(expRange)) expGained += rng.int(expRange[0], expRange[1]);
      const goldRange = cfg.lootGold[enemy.rank] || cfg.lootGold.default;
      if (isRange(goldRange)) goldGained += rng.int(goldRange[0], goldRange[1]);
    }
    if (expGained) applyExp(schema, state, expGained, levelUps);
    if (goldGained) state.gold = Number(state.gold || 0) + goldGained;
  }

  const outcome = combat.cleared ? 'victory' : combat.fled ? 'fled' : 'ended';
  state.combat = null;
  return ok({ outcome, expGained, goldGained, levelUps, player: clonePlayer(state.player) });
}

// 기존 expGain의 레벨업 문턱 로직과 동일하게 처리(ladder.thresholds 소비).
function applyExp(schema, state, amount, levelUps) {
  const ladder = ladderById(schema, 'player_level');
  state.player.exp = Number(state.player.exp || 0) + amount;
  if (!ladder || !Array.isArray(ladder.thresholds)) return;
  while (state.player.level <= ladder.thresholds.length) {
    const threshold = Number(ladder.thresholds[state.player.level - 1]);
    if (!threshold || state.player.exp < threshold) break;
    state.player.exp -= threshold;
    state.player.level += 1;
    levelUps.push(state.player.level);
  }
}

function findEnemy(combat, ref) {
  if (ref == null) return null;
  const key = String(ref);
  return combat.enemies.find((e) => e.id === key || e.name === key) || null;
}

function publicEnemy(e) {
  return { id: e.id, name: e.name, rank: e.rank, hp: { cur: e.hp.cur, max: e.hp.max }, dead: e.dead };
}

function clonePlayer(player) {
  return JSON.parse(JSON.stringify(player || {}));
}

function isRange(r) {
  return Array.isArray(r) && r.length === 2 && Number.isFinite(Number(r[0])) && Number.isFinite(Number(r[1]));
}

function intOr(value, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { startEncounter, combatAction, enemyAction, enemyTurn, endEncounter };
