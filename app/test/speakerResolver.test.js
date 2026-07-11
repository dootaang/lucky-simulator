'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findNpc, findGroup, resolveSpeaker, resolveSpeakerList } = require('../src/speakerResolver.js');

const schema = {
  entities: [{
    type: 'npc',
    instances: [
      { id: 'silvia', nameKo: '실비아', nameEn: 'Sylvia', aliases: ['붉은 레인저'] },
      { id: 'elena', nameKo: '엘레나', nameEn: 'Elena' },
      { id: 'marie', nameKo: '마리', nameEn: 'Marie' },
    ],
  }],
};
const asset0 = { name: 'silvia_default_0.png' };
const asset2 = { name: 'silvia_smile_2.png' };
const elenaAsset = { name: 'elena_default_0.png' };
const groups = [{
  charId: 'silvia',
  profile: { name: '실비아' },
  emotions: new Map([
    ['default', [{ asset: asset0, variant: 0 }]],
    ['smile', [{ asset: asset2, variant: 2 }]],
  ]),
}, {
  charId: 'elena',
  profile: { name: '엘레나' },
  emotions: new Map([['default', [{ asset: elenaAsset, variant: 0 }]]]),
}];
const pickAsset = (group, emotion, outfit) => group.emotions.get(emotion).find((item) => item.variant === outfit) || group.emotions.get(emotion)[0];

test('findNpc treats id, Korean name, English name, and aliases as the same NPC', () => {
  for (const value of ['silvia', 'SILVIA', '실비아', 'Sylvia', '붉은 레인저']) {
    assert.equal(findNpc(schema, value).id, 'silvia');
  }
});

test('findGroup reaches the same sprite group from a Korean speaker name', () => {
  const npc = findNpc(schema, '실비아');
  assert.equal(findGroup(groups, npc, '실비아').charId, 'silvia');
});

test('resolveSpeaker canonicalizes the id and selects the requested emotion and current outfit', () => {
  const result = resolveSpeaker({
    schema,
    groups,
    state: { npcs: { silvia: { outfit: 2 } } },
    reference: '실비아',
    requestedEmotion: 'SMILE',
    preferEmotion: () => 'default',
    pickAsset,
  });
  assert.equal(result.id, 'silvia');
  assert.equal(result.name, '실비아');
  assert.equal(result.emotion, 'smile');
  assert.equal(result.outfit, 2);
  assert.equal(result.asset, asset2);
});

test('resolveSpeaker falls back safely when an emotion or sprite group is missing', () => {
  const fallback = resolveSpeaker({ schema, groups, reference: '실비아', requestedEmotion: 'unknown', preferEmotion: () => 'default', pickAsset });
  assert.equal(fallback.emotion, 'default');
  assert.equal(fallback.asset, asset0);
  const noSprite = resolveSpeaker({ schema, groups, reference: '마리', preferEmotion: () => 'default', pickAsset });
  assert.equal(noSprite.id, 'marie');
  assert.equal(noSprite.group, null);
  assert.equal(noSprite.asset, null);
});

test('resolveSpeakerList clears missing speakers, canonicalizes aliases, and enforces one focus', () => {
  const options = { schema, groups, state: { npcs: { silvia: { outfit: 2 } } }, preferEmotion: () => 'default', pickAsset };
  assert.deepEqual(resolveSpeakerList({ ...options, items: undefined }), []);
  assert.deepEqual(resolveSpeakerList({ ...options, items: [] }), []);
  const list = resolveSpeakerList({ ...options, items: [
    { npcId: '실비아', emotion: 'smile', focus: true },
    { npcId: 'silvia', focus: false },
    { npcId: 'elena', focus: true },
  ] });
  assert.deepEqual(list, [
    { npcId: 'silvia', emotion: 'smile', focus: false },
    { npcId: 'elena', emotion: 'default', focus: true },
  ]);
});
