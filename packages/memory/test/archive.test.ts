import {describe,expect,it} from 'vitest';
import {MemoryLedger,memoryRecord,planGroundedMemory} from '../src/index.ts';

describe('오래된 서사 기억 페이지 보관',()=>{
  it('오래된 에피소드는 원문·근거를 보존한 페이지로 옮기고 다시 검색한다',async()=>{
    const ledger=new MemoryLedger();
    ledger.add(memoryRecord({id:'promise',text:'실비아와 반드시 귀환하기로 한 약속',turn:1,status:'approved',kind:'promise',evidence:[{kind:'message',id:'m1'}]}));
    for(let turn=2;turn<=42;turn+=1)ledger.add(memoryRecord({id:`episode-${turn}`,text:`북쪽 숲 원정 기록 ${turn}${turn===2?' 흰여우 구조':''}`,turn,status:'approved',kind:'episode',evidence:[{kind:'message',id:`m${turn}`}] }));
    const moved=ledger.archiveNarrativeMemories(500,{minimumAge:100,maxActive:10,pageSize:8});
    expect(moved).toBeGreaterThan(0);
    expect(ledger.get('promise')?.text).toContain('약속');
    const pages=ledger.archivePages(),archived=pages.flatMap(page=>page.records);
    expect(archived.find(record=>record.id==='episode-2')).toMatchObject({text:'북쪽 숲 원정 기록 2 흰여우 구조',evidence:[{kind:'message',id:'m2'}]});
    expect((await planGroundedMemory(ledger,'흰여우 구조',{atTurn:500,abstention:{mode:'off'}})).records.map(record=>record.id)).toContain('episode-2');
  });
  it('페이지는 저장 왕복 뒤에도 동일하다',()=>{
    const source=new MemoryLedger();for(let turn=1;turn<=5;turn+=1)source.add(memoryRecord({id:`e${turn}`,text:`장기 사건 ${turn}`,turn,status:'approved',kind:'event',evidence:[{kind:'event',id:String(turn)}]}));source.archiveNarrativeMemories(100,{minimumAge:1,maxActive:1,pageSize:2});
    const target=new MemoryLedger();target.reset(source.all(),source.archivePages());
    expect(target.archivePages()).toEqual(source.archivePages());
  });
});
