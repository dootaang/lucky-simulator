import { describe, expect, it } from 'vitest';
import { ingestHiddenMemoryPacket, withMemoryCaptureContract } from '../src/memory-contract.ts';

describe('서사 기억 수집 계약', () => {
  const prompt = { messages: [{ role: 'user' as const, content: '약속해' }], assistantPrefill: '', trace: [], warnings: [] };

  it('JSON과 산문 요청 모두 기억 후보와 근거를 요구한다', () => {
    const json = withMemoryCaptureContract(prompt, 'json'), prose = withMemoryCaptureContract(prompt, 'prose');
    expect(json.messages.some((message) => message.content.includes('memories:'))).toBe(true);
    expect(prose.messages.some((message) => message.content.includes('SIMBOT_MEMORY_PACKET'))).toBe(true);
    expect(prose.trace.at(-1)?.sourcePath).toBe('session.memory-contract');
  });

  it('산문 뒤의 숨은 봉투를 화면에서 제거하고 구조화 후보로 복구한다', () => {
    const result = ingestHiddenMemoryPacket({ text: '그녀는 약속했다.\n<!--SIMBOT_MEMORY_PACKET\n{"memories":[{"text":"귀환 약속","evidenceQuote":"반드시 돌아와"}],"factRefs":[{"claim":"약속","refs":["user-message"]}]}\n-->' });
    expect(result.text).toBe('그녀는 약속했다.');
    expect(result.memories).toEqual([{ text: '귀환 약속', evidenceQuote: '반드시 돌아와' }]);
    expect(result.factRefs).toEqual([{ claim: '약속', refs: ['user-message'] }]);
  });

  it('깨진 봉투는 노출하지도 저장하지도 않는다', () => {
    const result = ingestHiddenMemoryPacket({ text: '본문<!-- SIMBOT_MEMORY_PACKET {broken} -->' });
    expect(result).toEqual({ text: '본문' });
  });
});
