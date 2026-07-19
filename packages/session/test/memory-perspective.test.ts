import {describe,expect,it} from 'vitest';
import {MemoryLedger,memoryRecord} from '@simbot/memory';
import {defaultCardPreset} from '@simbot/risu';
import {ProjectRuntime} from '@simbot/runtime';
import {PlaySession} from '../src/index.ts';

describe('세션의 인물별 기억 전달',()=>{
  it('현재 화자만 아는 비밀을 별도 관점으로 표시한다',async()=>{
    const memory=new MemoryLedger();
    memory.add(memoryRecord({id:'vault',text:'지하 금고 암호는 0420이다',turn:0,status:'approved',kind:'secret',evidence:[{kind:'message',id:'m0'}],knowledge:{privacy:'secret',holderEntityIds:['silvia']}}));
    let call=0,secondPrompt='';
    const runtime=new ProjectRuntime({projectId:'perspective',schema:{entities:[{type:'npc',instances:[{id:'silvia',nameKo:'실비아'},{id:'boris',nameKo:'보리스'}]}],initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]});
    const session=new PlaySession({id:'perspective',runtime,memory,preset:defaultCardPreset(),card:{name:'Guide'},provider:{async complete(request){call+=1;if(call===2)secondPrompt=request.prompt.messages.map(message=>message.content).join('\n');return{text:'응답',speakers:[{npcId:'silvia'}]};}}});
    await session.send('실비아가 입장한다.');
    await session.send('지하 금고 암호를 떠올린다.');
    expect(secondPrompt).toContain('[실비아의 개인 기억');
    expect(secondPrompt).toContain('지하 금고 암호는 0420이다');
    expect(secondPrompt).toContain('다른 인물의 말이나 생각에 누설하지 않는다');
    expect(session.promptRuns.at(-1)?.memoryTrace?.included).toEqual([expect.objectContaining({id:'vault',sectionId:'silvia'})]);
  });
});
