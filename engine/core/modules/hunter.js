'use strict';

const { scopedEvent } = require('./eventSupport.js');

function createHunterModule() {
  return {
    id: 'genre.hunter', version: '1.0.0', dependencies: ['core.progression', 'rpg.party', 'rpg.loot'],
    stateAccess: { owns: ['hunter'], reads: ['player.*', 'party'], writes: ['gold', 'resources', 'player.exp'] },
    events: {
      'hunter/register': scopedEvent(({ state, params, ok, fail }) => {
        if (state.hunter && state.hunter.registered) return fail('hunter_already_registered');
        const name = String(params.name || '').trim(); if (!name) return fail('hunter_name_required');
        state.hunter = { ...(state.hunter || {}), registered: true, name, rank: null, assessmentScore: null, activeGateId: null, clearedGateId: null, guildId: null };
        return ok({ name });
      }),
      'hunter/assess': scopedEvent(({ schema, state, params, rng, ok, fail }) => {
        if (!state.hunter || !state.hunter.registered) return fail('hunter_not_registered');
        if (state.hunter.rank) return fail('hunter_already_assessed');
        const config = schema.hunter && schema.hunter.assessment || {}; const base = Number(params.score ?? config.defaultScore ?? 0);
        const variance = Array.isArray(config.variance) ? rng.int(Number(config.variance[0]), Number(config.variance[1])) : 0;
        const score = Math.max(0, base + variance); const rank = rankFor(score, config.ranks || []);
        if (!rank) return fail('hunter_rank_unresolved', score); state.hunter.assessmentScore = score; state.hunter.rank = rank.id;
        return ok({ score, rank: rank.id });
      }),
      'hunter/gate-accept': scopedEvent(({ schema, state, params, ok, fail }) => {
        if (!state.hunter || !state.hunter.rank) return fail('hunter_not_assessed'); if (state.hunter.activeGateId) return fail('gate_already_active');
        const gate = gates(schema).find((entry) => entry.id === params.gateId); if (!gate) return fail('unknown_gate', params.gateId);
        if (rankIndex(schema, state.hunter.rank) < rankIndex(schema, gate.minRank || 'E')) return fail('hunter_rank_too_low', gate.minRank);
        const partySize = state.party && state.party.members && state.party.members.length || 0; if (partySize < Number(gate.minParty || 0)) return fail('party_too_small', gate.minParty);
        state.hunter.activeGateId = gate.id; state.hunter.clearedGateId = null; return ok({ gateId: gate.id });
      }),
      'hunter/gate-clear': scopedEvent(({ state, params, ok, fail }) => {
        if (!state.hunter || state.hunter.activeGateId !== params.gateId) return fail('gate_not_active', params.gateId);
        state.hunter.clearedGateId = params.gateId; return ok({ gateId: params.gateId });
      }),
      'hunter/settle': scopedEvent(({ schema, state, params, rng, ok, fail }) => {
        const gate = gates(schema).find((entry) => entry.id === params.gateId); if (!gate || !state.hunter || state.hunter.clearedGateId !== gate.id) return fail('gate_not_cleared', params.gateId);
        const gold = roll(gate.settlement && gate.settlement.gold || 0, rng); const exp = roll(gate.settlement && gate.settlement.exp || 0, rng); const manaStone = roll(gate.settlement && gate.settlement.manaStone || 0, rng);
        state.gold = Number(state.gold || 0) + gold; state.player.exp = Number(state.player.exp || 0) + exp; state.resources = state.resources || {}; state.resources.mana_stone = Number(state.resources.mana_stone || 0) + manaStone;
        state.hunter.activeGateId = null; state.hunter.clearedGateId = null; return ok({ gateId: gate.id, gold, exp, manaStone });
      }),
      'hunter/guild-join': scopedEvent(({ schema, state, params, ok, fail }) => {
        if (!state.hunter || !state.hunter.rank) return fail('hunter_not_assessed'); const guild = (schema.hunter && schema.hunter.guilds || []).find((entry) => entry.id === params.guildId); if (!guild) return fail('unknown_guild', params.guildId);
        if (rankIndex(schema, state.hunter.rank) < rankIndex(schema, guild.minRank || 'E')) return fail('hunter_rank_too_low', guild.minRank); state.hunter.guildId = guild.id; return ok({ guildId: guild.id });
      }),
    },
    selectors: {
      'hunter/status': (schema, state) => ({ ...(state.hunter || {}), level: state.player.level, exp: state.player.exp, rankLabel: rankDef(schema, state.hunter && state.hunter.rank)?.label || null }),
      'hunter/gates': (schema, state) => gates(schema).map((gate) => ({ ...gate, available: !!(state.hunter && state.hunter.rank) && rankIndex(schema, state.hunter.rank) >= rankIndex(schema, gate.minRank || 'E') })),
      'hunter/guilds': (schema, state) => (schema.hunter && schema.hunter.guilds || []).map((guild) => ({ ...guild, joined: state.hunter && state.hunter.guildId === guild.id })),
    }, processes: {}, migrations: {},
  };
}

function gates(schema) { return schema.hunter && schema.hunter.gates || []; }
function ranks(schema) { return schema.hunter && schema.hunter.assessment && schema.hunter.assessment.ranks || []; }
function rankDef(schema, id) { return ranks(schema).find((entry) => entry.id === id); }
function rankIndex(schema, id) { return ranks(schema).findIndex((entry) => entry.id === id); }
function rankFor(score, definitions) { return definitions.filter((entry) => score >= Number(entry.min || 0)).sort((a, b) => Number(b.min || 0) - Number(a.min || 0))[0] || null; }
function roll(value, rng) { return Array.isArray(value) ? rng.int(Number(value[0]), Number(value[1])) : Number(value || 0); }

module.exports = { createHunterModule };
