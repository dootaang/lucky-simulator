import{describe,expect,it}from'vitest';import{type PromptPreset}from'@simbot/risu';import{ProjectRuntime}from'@simbot/runtime';import{PlaySession}from'../src/index.ts';

// 티어 통과 = 장기 회상 앵커(조종석 슬라이스 5). JSON 엔진 사실과 별도로 사람이 읽는 기억이 남고,
// 같은 앵커의 옛 티어 기억은 다음 승급이 폐기해야 300턴 뒤에도 "현재 단계"가 하나만 회수된다.
const source={source:'user' as const,path:'test'},preset:PromptPreset={contract:'prompt-preset/0.1',id:'p',name:'p',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:-1000,rangeEnd:'end',source},{id:'facts',type:'engineFacts',name:'facts',enabled:true,role:'system',source}]};
function runtime(){return new ProjectRuntime({projectId:'tier',schema:{scales:[{id:'affinity',range:[0,200],default:148,steps:{S:2,XL:11,'S-':-2,'XL-':-11},tiers:[{range:[0,80],label:'중립'},{range:[81,150],label:'신뢰'},{range:[151,180],label:'애착'}]}],entities:[{type:'npc',instances:[{id:'silvia',nameKo:'실비아'}]}],initialState:{npcs:{silvia:{affinity:148}}}},screens:[{id:'play',regions:{actions:[{widget:'action-group',actions:[{event:{id:'scale_delta',params:{}}}]}]}}],navigation:[],content:{},featureToggles:{},moduleIds:['core.stats']});}

describe('tier promotion memory anchor',()=>{
  it('승급 시 이름·티어가 든 읽을 수 있는 기억이 승인 상태로 남고, 재승급이 이전 앵커를 폐기한다',async()=>{
    const session=new PlaySession({id:'t',runtime:runtime(),preset,card:{name:'여관'},provider:{async complete(){return{text:'감동적인 순간',events:[{id:'scale_delta',params:{scale:'affinity',target:'silvia',size:'XL',direction:'+'}}]};}}});
    await session.send('실비아에게 선물을 준다');
    const anchors=session.memory.all().filter((record)=>record.id.startsWith('tier:'));
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.text).toContain('실비아');
    expect(anchors[0]!.text).toContain("'애착' 단계");
    expect(anchors[0]!).toMatchObject({status:'approved',kind:'relation',canonicalAnchors:['tier:affinity:silvia']});
    // 강등(재변경) — 같은 앵커라 이전 기억이 superseded 된다 (148+11=159 애착 → 159-11=148 신뢰)
    session.setProvider({async complete(){return{text:'차가운 침묵',events:[{id:'scale_delta',params:{scale:'affinity',target:'silvia',size:'XL',direction:'-'}}]};}});
    await session.send('실비아를 실망시킨다');
    const all=session.memory.all().filter((record)=>record.id.startsWith('tier:'));
    expect(all.filter((record)=>record.status==='approved')).toHaveLength(1);
    expect(all.find((record)=>record.status==='approved')!.text).toContain("'신뢰' 단계");
    expect(all.filter((record)=>record.status==='superseded')).toHaveLength(1);
  });
});
