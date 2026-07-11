import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNarrative } from '../core/memory/narrativeVerifier.ts';

test('narrative verifier: 실패한 엔진 사건이 있으면 성공처럼 보일 수 있는 서사를 교체한다', () => {
  const result = verifyNarrative({ narrative: '실비아가 정식 직원이 되어 환하게 웃었다.', hasFailedProposedEvent: true, fallback: '고용 조건을 충족하지 못했습니다.' });
  assert.equal(result.text, '고용 조건을 충족하지 못했습니다.');
  assert.equal(result.issues[0].code, 'failed-event-claim');
});

test('narrative verifier: 근거 없는 숫자가 든 문장만 제거한다', () => {
  const result = verifyNarrative({
    narrative: '실비아가 고개를 끄덕였다. 금고에는 999,999원이 쌓였다. 다음 이야기를 기다린다.',
    evidenceTexts: ['현재 골드 500,000원'],
  });
  assert.doesNotMatch(result.text, /999,999/);
  assert.match(result.text, /실비아가 고개/);
  assert.match(result.text, /다음 이야기/);
  assert.equal(result.issues[0].detail, '999999');
});

test('narrative verifier: 상태·사용자 발언에 실제 있는 숫자는 유지한다', () => {
  const result = verifyNarrative({ narrative: '일급 10,000원을 제안했다.', evidenceTexts: ['사용자: 일급 만 원, 즉 10,000원으로 하자'] });
  assert.equal(result.text, '일급 10,000원을 제안했다.');
  assert.deepEqual(result.issues, []);
});
