import {describe,expect,it} from 'vitest';
import {MemoryLedger,memoryRecord,planGroundedMemory} from '@simbot/memory';
import {defaultCardPreset} from '@simbot/risu';
import {ProjectRuntime} from '@simbot/runtime';
import {PlaySession,type SessionSnapshot} from '../src/index.ts';

const runtime=()=>new ProjectRuntime({projectId:'memory-archive',schema:{initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]});
const make=(memory=new MemoryLedger())=>new PlaySession({id:'memory-archive',runtime:runtime(),memory,preset:defaultCardPreset(),card:{name:'Archive'},provider:{async complete(){return{text:'응답'};}}});

describe('세션의 장기 기억 페이지 왕복',()=>{
  it('수백 턴의 원문 페이지와 중요한 약속을 저장·복원하고 다시 찾는다',async()=>{
    const memory=new MemoryLedger();
    memory.add(memoryRecord({id:'promise',text:'항상 함께 귀환한다는 약속',turn:1,status:'approved',kind:'promise',evidence:[{kind:'message',id:'m1'}]}));
    for(let turn=2;turn<=702;turn+=1)memory.add(memoryRecord({id:`episode-${turn}`,text:`장기 원정 ${turn}${turn===2?' 푸른나침반 발견':''}`,turn,status:'approved',kind:'episode',evidence:[{kind:'message',id:`m${turn}`}] }));
    expect(memory.archiveNarrativeMemories(1000)).toBeGreaterThan(0);
    const source=make(memory),snapshot=source.snapshot();
    expect(snapshot.memoryArchivePages?.length).toBeGreaterThan(0);
    const restored=make();restored.restore(snapshot);
    expect(restored.memory.get('promise')?.text).toContain('약속');
    expect(restored.memory.archivePages()).toEqual(memory.archivePages());
    expect((await planGroundedMemory(restored.memory,'푸른나침반 발견',{atTurn:1000,abstention:{mode:'off'}})).records[0]?.id).toBe('episode-2');
  });
  it('보관 페이지가 변조되면 무결성 검사가 복원을 거부한다',()=>{
    const memory=new MemoryLedger();for(let turn=1;turn<=4;turn+=1)memory.add(memoryRecord({id:`e${turn}`,text:`사건 ${turn}`,turn,status:'approved',kind:'event',evidence:[{kind:'event',id:String(turn)}]}));memory.archiveNarrativeMemories(100,{minimumAge:1,maxActive:1});
    const snapshot=structuredClone(make(memory).snapshot()) as SessionSnapshot;
    const page=snapshot.memoryArchivePages?.[0];if(page)(page.records[0] as {text:string}).text='변조';
    expect(()=>make().restore(snapshot)).toThrow(/session_corrupt/);
  });
});
