'use strict';

const { deriveRng } = require('./rng.js');

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const STATS = {
  E: { hp: 8, atk: 4, def: 0, evade: 8, acc: 0 },
  D: { hp: 12, atk: 6, def: 1, evade: 9, acc: 1 },
  C: { hp: 18, atk: 8, def: 2, evade: 10, acc: 2 },
  B: { hp: 26, atk: 11, def: 3, evade: 11, acc: 3 },
  A: { hp: 36, atk: 14, def: 5, evade: 12, acc: 4 },
  S: { hp: 50, atk: 18, def: 7, evade: 14, acc: 6 },
};

function rollQuestEncounter(schema, state, quest) {
  const chance = Number(quest && quest.encounterChance || 0);
  const pool = schema && schema.encounters && schema.encounters.pool;
  if (!(chance > 0) || !schema.combat || !Array.isArray(pool) || !pool.length) return null;
  const rng = deriveRng(state.seed ?? 0, `questenc/${state.day}/${quest.id}`);
  if (rng.next() * 100 >= chance) return null;
  const target = Math.max(0, RANKS.indexOf(quest.rewardTier));
  let picked = pool[0];
  let distance = Infinity;
  for (const entry of pool) {
    const index = RANKS.indexOf(entry.rank);
    const nextDistance = Math.abs((index < 0 ? 0 : index) - target);
    if (nextDistance < distance) { picked = entry; distance = nextDistance; }
  }
  const range = picked.count || [1, 1];
  const count = rng.int(range[0], range[1]);
  const stats = STATS[picked.rank] || STATS.E;
  return {
    encounter: picked,
    enemies: Array.from({ length: count }, (_, index) => ({
      name: count > 1 ? `${picked.name} ${index + 1}` : picked.name,
      rank: picked.rank,
      ...stats,
    })),
  };
}

module.exports = { rollQuestEncounter };
