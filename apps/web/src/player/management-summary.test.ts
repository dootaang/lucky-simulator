import { describe, expect, it } from 'vitest';
import { buildManagementSummary } from './management-summary';

describe('genre-neutral management summary', () => {
  it('reuses declared status, pending decisions, and recent receipts without genre branches', () => {
    const cards = Array.from({ length: 5 }, (_, index) => ({ key:`task-${index}`, icon:'star' as const, title:`할 일 ${index}`, desc:'', more:'', options:[] }));
    const logs = Array.from({ length: 8 }, (_, index) => ({ ok:true, event:'resource_delta', index }));
    const model = buildManagementSummary({ fixed:[{id:'day',label:'',value:'3일차'}], gauges:[{id:'hp',label:'HP',value:'8/10'}] }, cards, logs);
    expect(model.status.map(item => item.id)).toEqual(['day', 'hp']);
    expect(model.tasks).toHaveLength(4);
    expect(model.recentLogs.map(log => log.index)).toEqual([2,3,4,5,6,7]);
  });
});
