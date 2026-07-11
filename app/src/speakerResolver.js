'use strict';

function normalized(value) {
  return String(value == null ? '' : value).trim().normalize('NFKC').toLowerCase();
}

function npcEntities(schema) {
  const block = ((schema && schema.entities) || []).find((entry) => entry && entry.type === 'npc');
  return (block && Array.isArray(block.instances)) ? block.instances : [];
}

function aliasesOf(npc) {
  if (!npc) return [];
  const aliases = Array.isArray(npc.aliases) ? npc.aliases : [];
  return [npc.id, npc.name, npc.nameKo, npc.nameEn, ...aliases].filter(Boolean);
}

function findNpc(schema, reference) {
  const key = normalized(reference);
  if (!key) return null;
  return npcEntities(schema).find((npc) => aliasesOf(npc).some((alias) => normalized(alias) === key)) || null;
}

function groupAliases(group) {
  if (!group) return [];
  return [group.charId, group.profile && group.profile.name].filter(Boolean);
}

function findGroup(groups, npc, reference) {
  const keys = new Set([reference, ...aliasesOf(npc)].map(normalized).filter(Boolean));
  return (groups || []).find((group) => groupAliases(group).some((alias) => keys.has(normalized(alias)))) || null;
}

function stateNpc(state, canonicalId, reference) {
  const npcs = (state && state.npcs) || {};
  const wanted = new Set([canonicalId, reference].map(normalized).filter(Boolean));
  const key = Object.keys(npcs).find((id) => wanted.has(normalized(id)));
  return key ? npcs[key] : null;
}

function emotionOf(group, requestedEmotion, preferEmotion) {
  if (!group || !group.emotions || typeof group.emotions.keys !== 'function') return undefined;
  const wanted = normalized(requestedEmotion);
  if (wanted) {
    const exact = Array.from(group.emotions.keys()).find((emotion) => normalized(emotion) === wanted);
    if (exact) return exact;
  }
  return typeof preferEmotion === 'function' ? preferEmotion(group) : Array.from(group.emotions.keys())[0];
}

function resolveSpeaker({ schema, groups, state, reference, requestedEmotion, preferEmotion, pickAsset } = {}) {
  const raw = String(reference == null ? '' : reference).trim();
  if (!raw) return null;
  const npc = findNpc(schema, raw);
  const group = findGroup(groups, npc, raw);
  const id = String((npc && npc.id) || (group && group.charId) || raw);
  const name = String((npc && (npc.nameKo || npc.name || npc.nameEn)) || (group && group.profile && group.profile.name) || id);
  const emotion = emotionOf(group, requestedEmotion, preferEmotion);
  const npcState = stateNpc(state, id, raw);
  const outfit = npcState && Number.isFinite(Number(npcState.outfit)) ? Number(npcState.outfit) : undefined;
  const picked = group && emotion && typeof pickAsset === 'function' ? pickAsset(group, emotion, outfit) : null;
  return { id, name, npc, group, emotion, outfit, asset: picked && picked.asset };
}

function resolveSpeakerList({ schema, groups, state, items, preferEmotion, pickAsset } = {}) {
  const resolved = [];
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const presentation = resolveSpeaker({ schema, groups, state, reference: item.npcId, requestedEmotion: item.emotion, preferEmotion, pickAsset });
    if (!presentation || !presentation.group) continue;
    if (byId.has(presentation.id)) {
      if (item.focus === true) byId.get(presentation.id).requestedFocus = true;
      continue;
    }
    const entry = { npcId: presentation.id, emotion: presentation.emotion, focus: false, requestedFocus: item.focus === true };
    byId.set(presentation.id, entry);
    resolved.push(entry);
    if (resolved.length === 3) break;
  }
  let focusIndex = -1;
  for (let i = 0; i < resolved.length; i += 1) if (resolved[i].requestedFocus) focusIndex = i;
  if (focusIndex < 0 && resolved.length) focusIndex = resolved.length - 1;
  return resolved.map((entry, index) => ({ npcId: entry.npcId, emotion: entry.emotion, focus: index === focusIndex }));
}

module.exports = { aliasesOf, findNpc, findGroup, normalized, resolveSpeaker, resolveSpeakerList };
