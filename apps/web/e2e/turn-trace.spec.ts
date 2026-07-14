import{resolve}from'node:path';
import{expect,test}from'@playwright/test';

const repo=resolve(process.cwd(),'../..').split(String.fromCharCode(92)).join('/');

// 콘솔이 쓸모 있으려면 평소에도 뭔가 흘러야 한다. 턴 하나를 돌리면 네 가지가 남아야 한다:
// 프롬프트 조립 · 모델 응답 · 엔진 사실(차단 포함) · 기억. "눌렀는데 아무 일도 안 일어남"의 원인은
// 대개 이 넷 중 하나이고, 콘솔은 어디서 끊겼는지 사용자가 직접 읽을 수 있게 해야 한다.
test('턴 하나가 프롬프트·모델·엔진 사실을 콘솔에 남기고, 차단된 이벤트는 경고로 남는다',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(repo)=>{
    const[{PlaySession},{ProjectRuntime},{diagnostics},{createTurnTracer}]=await Promise.all([import(`/@fs/${repo}/packages/session/src/index.ts`),import(`/@fs/${repo}/packages/runtime/src/index.ts`),import('/src/player/diagnostics.svelte.ts'),import('/src/player/turn-trace.ts')]);
    const preset={contract:'prompt-preset/0.1',id:'p',name:'p',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:-1000,rangeEnd:'end',source:{source:'user',path:'t'}},{id:'facts',type:'engineFacts',name:'facts',enabled:true,role:'system',source:{source:'user',path:'t'}}]};
    const runtime=new ProjectRuntime({projectId:'trace',schema:{entities:[],initialState:{gold:500}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]});
    // 모델이 골드를 직접 바꾸겠다고 제안한다 — 엔진은 이걸 차단해야 하고, 콘솔은 그 사실을 보여야 한다.
    const session=new PlaySession({id:'trace-session',runtime,preset,card:{name:'추적 카드'},provider:{async complete(){return{text:'그녀가 웃었다.',events:[{id:'gold_delta',params:{amount:-50}}],usage:{inputTokens:120,outputTokens:30},model:'test-model',finishReason:'stop'};}}});
    diagnostics.clear();
    const trace=createTurnTracer();
    await session.send('안녕');
    trace(session,'추적 카드');
    const codes=diagnostics.events.map(event=>event.code);
    const model=diagnostics.events.find(event=>event.code==='model_response');
    const engine=diagnostics.events.find(event=>event.code==='engine_facts');
    const copy=diagnostics.copyText(); // 비우기 전에 뜬다 — 복사본은 이 턴의 사건을 담아야 한다
    // 정보 레벨을 끄면 더 이상 흐르지 않는다 — 끈 레벨은 만들지도 않는다.
    diagnostics.clear();diagnostics.levels.info=false;
    const trace2=createTurnTracer();
    await session.send('또 안녕');
    trace2(session,'추적 카드');
    const infoOffCodes=diagnostics.events.map(event=>event.code);
    diagnostics.levels.info=true;
    return{codes,infoOffCodes,modelDetail:model?.detail??{},modelLevel:model?.level,engineSummary:engine?.summary??'',turn:model?.turn??null,copy};
  },repo);
  expect(result.codes).toContain('prompt_built');
  expect(result.codes).toContain('model_response');
  expect(result.codes).toContain('engine_facts');
  expect(result.modelLevel).toBe('info');
  expect(result.modelDetail['모델']).toBe('test-model');
  expect(result.modelDetail['토큰']).toContain('입력 120');
  expect(result.turn).toBe(0); // 사건이 턴에 묶인다(첫 턴은 0) — "마지막 턴만 복사"가 이걸로 동작한다
  // 정보가 꺼지면 정보 사건은 사라지고, 경고(차단)는 남는다.
  expect(result.infoOffCodes).not.toContain('model_response');
  expect(result.infoOffCodes).toContain('engine_event_blocked');
  // LLM이 골드를 직접 바꾸겠다고 제안했지만 엔진이 차단했다 — 콘솔은 그 사실을 경고로 보여줘야 한다.
  // 이게 안 보이면 사용자는 "왜 골드가 안 줄지?"에서 영원히 멈춘다.
  expect(result.codes).toContain('engine_event_blocked');
  expect(result.engineSummary).toContain('1건 차단');
  expect(result.copy).toContain('LLM은 사실을 직접 바꾸지 못한다');
});

test('같은 수의 런을 가진 두 채팅을 번갈아도 각각 추적한다',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async(repo)=>{
    const[{PlaySession},{ProjectRuntime},{diagnostics},{createTurnTracer}]=await Promise.all([import(`/@fs/${repo}/packages/session/src/index.ts`),import(`/@fs/${repo}/packages/runtime/src/index.ts`),import('/src/player/diagnostics.svelte.ts'),import('/src/player/turn-trace.ts')]);
    const preset={contract:'prompt-preset/0.1',id:'p',name:'p',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:-1000,rangeEnd:'end',source:{source:'user',path:'t'}}]},make=(id:string)=>new PlaySession({id,runtime:new ProjectRuntime({projectId:id,schema:{entities:[],initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]}),preset,card:{name:id},provider:{async complete(){return{text:'응답',events:[]};}}});
    const first=make('chat-a'),second=make('chat-b'),trace=createTurnTracer();diagnostics.clear();
    await first.send('하나');await second.send('둘');trace(first,'A');trace(second,'B');
    return diagnostics.events.filter(event=>event.code==='model_response').map(event=>event.chat).sort();
  },repo);
  expect(result).toEqual(['chat-a','chat-b']);
});
