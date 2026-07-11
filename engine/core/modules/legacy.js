'use strict';

const LEGACY_EVENT_IDS = Object.freeze([
  'checkin',
  'checkout',
  'sale',
  'upgrade',
  'hire',
  'set_wage',
  'fire',
  'set_outfit',
  'reward',
  'attempt_quest',
  'gold_delta',
  'traffic_wave',
  'incident_choice',
  'lodging_review',
  'lodging_accept',
  'lodging_reject',
  'mail_check',
  'mail_open',
  'day_end',
]);

function createLegacyModule(applyLegacyEvent) {
  if (typeof applyLegacyEvent !== 'function') throw new TypeError('legacy_handler_required');
  const events = {};
  for (const id of LEGACY_EVENT_IDS) {
    events[id] = ({ schema, state, event, rng }) => applyLegacyEvent(schema, state, event, rng);
  }
  return {
    id: 'legacy.monolith',
    version: '1.0.0',
    dependencies: ['core.stats', 'core.inventory', 'combat.turnbased'],
    stateAccess: {
      owns: ['day', 'gold', 'facilities.*', 'staff', 'rooms.*', 'mail', 'traffic', 'pendingQuest', 'questAttempts', 'claimedRewards', 'npcs.*.outfit'],
      // reputation은 core.stats 소유 — 레거시는 우편/평판 배율에서 읽기만 한다(감사 지적: writes 오기재 교정).
      reads: ['combat', 'player.*', 'reputation.*'],
      // player.pools.*는 day_end의 pool_recover 정산이 쓴다(감사 지적: 누락 선언 보완).
      writes: ['combat', 'resources.*', 'player.pools.*', 'npcs.*.<scale>', 'npcs.*.<scale>DeltaToday'],
    },
    events,
    selectors: {},
    processes: {},
    migrations: {},
  };
}

module.exports = { LEGACY_EVENT_IDS, createLegacyModule };
