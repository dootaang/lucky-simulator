import { describe, expect, it } from 'vitest';
import { MemoryLedger, memoryRecord } from '../src/index.ts';

describe('memory review', () => {
  it('keeps a rejected candidate out of retrieval', () => {
    const ledger = new MemoryLedger();
    ledger.add(memoryRecord({ id: 'candidate', text: '실비아는 급료 인상을 약속받았다', turn: 2, evidence: [{ kind: 'message', id: 'm2' }] }));
    ledger.reject('candidate');
    expect(ledger.get('candidate')?.status).toBe('rejected');
    expect(ledger.retrieve('실비아 급료 인상', 3).abstained).toBe(true);
  });
});
