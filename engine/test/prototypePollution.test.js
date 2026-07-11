'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../../schema/yongsa-inn.v0.json');
const { createState } = require('../core/createState.js');
const { applyEvent } = require('../core/applyEvent.js');

// 일괄 감사 Critical: '__proto__' 류 키가 상태 맵의 존재 검사를 프로토타입 체인으로
// 우회해 Object.prototype을 오염시키는 경로 차단 회귀망. 세션 파일 가져오기(원장 재생)와
// LLM 노출 이벤트(scale_delta)가 이 경로에 도달할 수 있으므로 엔진이 최종 방어선이다.
const rng = { int: (min) => min, next: () => 0 };
const DANGEROUS = ['__proto__', 'prototype', 'constructor'];

function assertPrototypeClean() {
  assert.equal(Object.prototype.outfit, undefined);
  assert.equal(Object.prototype.affinity, undefined);
  assert.equal(Object.prototype.affinityDeltaToday, undefined);
}

test('set_outfit — 위험 키 npcId는 unknown_target으로 거부되고 프로토타입이 오염되지 않는다', () => {
  for (const npcId of DANGEROUS) {
    const result = applyEvent(schema, createState(schema, 1), { id: 'set_outfit', params: { npcId, outfit: 5 } }, rng);
    assert.equal(result.log[0].ok, false, npcId);
    assert.equal(result.log[0].reason, 'unknown_target', npcId);
  }
  assertPrototypeClean();
});

test('scale_delta — 위험 키 target은 거부된다 (LLM 노출 이벤트 — 악성 카드 경유 도달 가능)', () => {
  for (const target of DANGEROUS) {
    const result = applyEvent(schema, createState(schema, 1), { id: 'scale_delta', params: { scale: 'affinity', target, size: 'S', direction: '+' } }, rng);
    assert.equal(result.log[0].ok, false, target);
    assert.equal(result.log[0].reason, 'unknown_target', target);
  }
  assertPrototypeClean();
});

test('gain_resource/resource_delta — 상속 키는 in 검사를 통과하지 못한다', () => {
  for (const resource of DANGEROUS) {
    for (const id of ['gain_resource', 'resource_delta']) {
      const result = applyEvent(schema, createState(schema, 1), { id, params: { resource, amount: 5, scale: 'small' } }, rng);
      assert.equal(result.log[0].ok, false, `${id}:${resource}`);
      assert.equal(result.log[0].reason, 'unknown_resource', `${id}:${resource}`);
    }
  }
});

test('사건 affinity — 위험 키 target은 무대상 처리되어 오염 없이 파동만 진행된다', () => {
  const source = JSON.parse(JSON.stringify(schema));
  source.traffic.incidents = { chance: 100, deck: [{
    id: 'polluter', label: '오염 시도', weight: 1,
    choices: [{ id: 'choose', label: '선택', effects: { affinity: { size: 'L', direction: '+', target: '__proto__' } } }],
  }] };
  const state = createState(source, 7);
  state.pendingIncident = { day: state.day, waveId: 'lunch', incidentId: 'polluter' };
  const result = applyEvent(source, state, { id: 'incident_choice', params: { choice: 'choose' } }, rng);
  assert.equal(result.log[0].ok, true);
  assert.equal(result.log[0].affinityDeltas, undefined);
  assertPrototypeClean();
});

test('checkin/checkout — 위험 키 roomNo는 방으로 취급되지 않는다', () => {
  const source = JSON.parse(JSON.stringify(schema));
  const roomBlock = (source.entities || []).find((entry) => entry.type === 'room');
  if (roomBlock) roomBlock.instances.push({ no: '__proto__', kind: '오염실', pricePerNight: 0, capacity: 9 });
  const checkin = applyEvent(source, createState(source, 1), { id: 'checkin', params: { roomNo: '__proto__', guestName: 'A', stayDays: 1 } }, rng);
  assert.equal(checkin.log[0].ok, false);
  assert.equal(checkin.log[0].reason, 'unknown_room');
  const checkout = applyEvent(schema, createState(schema, 1), { id: 'checkout', params: { roomNo: '__proto__', guestName: 'A' } }, rng);
  assert.equal(checkout.log[0].ok, false);
});
