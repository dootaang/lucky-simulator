import {describe,expect,it} from 'vitest';import {compilePrompt,defaultCardPreset,importRisuPreset,type PromptPreset} from '../src/index.ts';
describe('리스 기본 프롬프트',()=>{it('JSON 지시 없이 카드 자료를 리스 순서로 조립한다',()=>{const result=compilePrompt({preset:defaultCardPreset(),card:{name:'실비아',systemPrompt:'SYSTEM',description:'DESC',personality:'PERSONA-CARD'},persona:{contract:'persona/0.1',id:'u',name:'주인장',prompt:'USER-PERSONA',icon:'',note:'',embeddedModule:null,source:null,version:1},lore:{entries:[{content:'LORE'}]},chat:[{role:'user',content:'CHAT'}]});expect(result.messages.map(x=>x.content)).toEqual(['SYSTEM','DESC\n\nDescription of 실비아: PERSONA-CARD','USER-PERSONA','LORE','CHAT']);expect(result.messages.some(x=>/JSON/i.test(x.content))).toBe(false);});});
describe('리스 프리셋 가져오기',()=>{it('지원 항목을 변환하고 미지원 항목을 비활성 보존한다',()=>{const imported=importRisuPreset({name:'내 프리셋',temperature:80,maxResponse:700,promptSettings:{assistantPrefill:'계속',sendName:true},promptTemplate:[{type:'plain',type2:'main',role:'bot',text:'Hello'},{type:'chat',rangeStart:-20,rangeEnd:'end'},{type:'chatML',text:'<system>x'}]});expect(imported.preset.blocks[0]).toMatchObject({type:'plain',role:'assistant',slot:'main'});expect(imported.preset.blocks[2]).toMatchObject({type:'unsupported',originalType:'chatML',enabled:false});expect(imported.unsupported).toEqual([{type:'chatML',reason:'ChatML 전체 파서는 이번 범위 밖'}]);expect(imported.provider).toEqual({temperature:.8,maxTokens:700});});});
describe('depth 삽입',()=>{it('authornote depth=4를 대화 뒤에서 네 번째 위치에 넣는다',()=>{const preset:PromptPreset={...defaultCardPreset(),blocks:[{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:0,rangeEnd:'end',source:null},{id:'note',type:'authornote',name:'note',enabled:true,role:'system',depth:4,source:null}]},chat=Array.from({length:6},(_,i)=>({role:(i%2?'assistant':'user') as 'user'|'assistant',content:`m${i}`})),result=compilePrompt({preset,card:{name:'C'},chat,authorNote:{content:'NOTE'}});expect(result.messages.map(x=>x.content)).toEqual(['m0','m1','NOTE','m2','m3','m4','m5']);});});

describe('카드 프리셋 v2 — 엔진 사실 기본 활성',()=>{
  // 리스 카드는 Lua로 상태를 프롬프트에 주입하지만 우리는 Lua를 실행하지 않는다.
  // engineFacts가 꺼져 있으면 모델이 골드·일차를 모른 채 숫자를 지어내 영수증과 서사가 어긋난다.
  it('엔진 사실 블록이 켜져 있고 JSON 지시는 없다',()=>{
    const preset=defaultCardPreset();
    const facts=preset.blocks.find((b)=>b.type==='engineFacts');
    expect(facts?.enabled).toBe(true);
    expect(preset.version).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(preset)).not.toMatch(/JSON으로 응답/);
  });
});
