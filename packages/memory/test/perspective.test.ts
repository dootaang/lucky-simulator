import {describe,expect,it} from 'vitest';
import {MemoryLedger,memoryRecord,planPerspectiveMemory} from '../src/index.ts';

describe('관점별 기억 계획',()=>{
  it('공통 사실과 현재 인물의 비밀을 분리해 같은 기억을 중복 주입하지 않는다',async()=>{
    const ledger=new MemoryLedger();
    ledger.add(memoryRecord({id:'public',text:'지하 금고는 기지 아래에 있다',turn:1,status:'approved',evidence:[{kind:'event',id:'1'}]}));
    ledger.add(memoryRecord({id:'secret',text:'지하 금고 암호는 0420이다',turn:1,status:'approved',kind:'secret',evidence:[{kind:'message',id:'m1'}],knowledge:{privacy:'secret',holderEntityIds:['silvia']}}));
    const plan=await planPerspectiveMemory(ledger,'지하 금고 암호', {atTurn:2,limit:8},[{id:'silvia',label:'실비아'}]);
    expect(plan.sections.find(section=>section.id==='common')?.records.map(record=>record.id)).toEqual(['public']);
    expect(plan.sections.find(section=>section.id==='silvia')?.records.map(record=>record.id)).toEqual(['secret']);
    expect(plan.trace.included.map(row=>row.id)).toEqual(['public','secret']);
  });
});
