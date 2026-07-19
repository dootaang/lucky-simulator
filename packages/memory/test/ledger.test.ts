import{describe,expect,it}from'vitest';import{MemoryLedger,memoryRecord}from'../src/index.ts';describe('grounded memory',()=>{it('candidate is hidden until approved and secrets are scoped',()=>{const ledger=new MemoryLedger(),record=memoryRecord({id:'promise',text:'실비아의 일급을 만 원으로 올리기로 약속했다',turn:2,scope:{kind:'entity',entityId:'silvia'},evidence:[{kind:'message',id:'m2'}]});ledger.add(record);expect(ledger.retrieve('실비아 일급 약속',10,{entityIds:['silvia']}).abstained).toBe(true);ledger.approve('promise');expect(ledger.retrieve('실비아 일급 약속',10,{entityIds:['silvia']}).records[0]?.id).toBe('promise');expect(ledger.retrieve('실비아 일급 약속',10,{}).abstained).toBe(true);});it('superseded facts disappear from current retrieval',()=>{const ledger=new MemoryLedger();ledger.add(memoryRecord({id:'room',text:'현재 방은 101호다',turn:1,evidence:[{kind:'event',id:'e1'}],status:'approved'}));ledger.supersede('room',5);expect(ledger.retrieve('현재 방',6).abstained).toBe(true);expect(ledger.retrieve('현재 방',4).records[0]?.id).toBe('room');});it('300 turns do not expand prompt retrieval beyond limit',()=>{const ledger=new MemoryLedger();for(let turn=0;turn<300;turn++)ledger.add(memoryRecord({id:`m${turn}`,text:`모험 기록 ${turn} 공통사건`,turn,evidence:[{kind:'message',id:`msg${turn}`}],status:'approved'}));expect(ledger.retrieve('공통사건',300,{},8).records).toHaveLength(8);});});
describe('reset — 되돌리기의 권위적 복원',()=>{it('reset은 기존 레코드를 비우고 스냅샷 집합으로 정확히 대체한다',()=>{const ledger=new MemoryLedger();ledger.add(memoryRecord({id:'a',text:'과거 사실',turn:1,evidence:[{kind:'message',id:'m1'}],status:'approved'}));const snap=ledger.all();ledger.add(memoryRecord({id:'b',text:'미래 사실',turn:2,evidence:[{kind:'message',id:'m2'}],status:'approved'}));expect(ledger.all()).toHaveLength(2);ledger.reset(snap);expect(ledger.all().map((r)=>r.id)).toEqual(['a']);});});

describe('장기 회차 엔진 사실 정리',()=>{
  const fact=(id:string,turn:number)=>memoryRecord({id,text:`현재 값 ${turn}`,turn,status:'approved',kind:'engine-fact',canonicalAnchors:['engine:clock'],evidence:[{kind:'event',id:String(turn)}]});
  it('원본 저널이 있는 반복 사실은 현재 1개와 직전 1개만 남기고 중요한 기억은 보존한다',()=>{
    const ledger=new MemoryLedger();
    ledger.add(memoryRecord({id:'promise',text:'반드시 돌아오겠다는 약속',turn:0,status:'approved',kind:'promise',evidence:[{kind:'message',id:'m0'}]}));
    ledger.add(fact('engine-0',0));
    for(let turn=1;turn<=100;turn+=1)ledger.replace(fact(`engine-${turn}`,turn),turn);
    const records=ledger.all(),engine=records.filter(value=>value.kind==='engine-fact');
    expect(engine).toHaveLength(2);
    expect(engine.filter(value=>value.status==='approved')).toHaveLength(1);
    expect(engine.filter(value=>value.status==='superseded')).toHaveLength(1);
    expect(records.find(value=>value.id==='promise')?.text).toContain('약속');
  });
  it('공유 체크포인트는 이후 교체에도 과거 상태를 유지한다',()=>{
    const ledger=new MemoryLedger();ledger.add(fact('old',1));const checkpoint=ledger.checkpoint();
    ledger.replace(fact('new',2),2);
    expect(checkpoint.map(value=>value.id)).toEqual(['old']);
    expect(checkpoint[0]?.status).toBe('approved');
  });
});

describe('인물별 기억 공개 범위',()=>{
  it('명시된 인물만 비밀을 보고 공통 시점과 다른 인물에게는 숨긴다',()=>{
    const ledger=new MemoryLedger();
    ledger.add(memoryRecord({id:'secret',text:'실비아는 지하 금고 암호를 안다',turn:1,status:'approved',kind:'secret',evidence:[{kind:'message',id:'m1'}],knowledge:{privacy:'secret',holderEntityIds:['silvia'],visibleToEntityIds:['silvia']}}));
    expect(ledger.retrieve('지하 금고 암호',2,{}).abstained).toBe(true);
    expect(ledger.retrieve('지하 금고 암호',2,{entityIds:['other']}).abstained).toBe(true);
    expect(ledger.retrieve('지하 금고 암호',2,{entityIds:['silvia']}).records[0]?.id).toBe('secret');
  });
});
