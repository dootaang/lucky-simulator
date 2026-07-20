import {describe,expect,it} from 'vitest';
import {createAnthropicProvider,createGoogleProvider,createOpenAICompatibleProvider,createProvider,fetchModels,ollamaEndpoint,PlaySession} from '../src/index.ts';
import {cardToRuntimeProject,translateYspTags,type PromptPreset} from '@simbot/risu';import {ProjectRuntime} from '@simbot/runtime';
const prompt={messages:[{role:'system' as const,content:'규칙'},{role:'user' as const,content:'안녕'}],assistantPrefill:'',trace:[],warnings:[]};
const preset:PromptPreset={contract:'prompt-preset/0.1',id:'t',name:'t',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:-20,rangeEnd:'end',source:{source:'user',path:'test'}}]};
describe('OpenAI 응답 형식',()=>{it('산문에서는 JSON 강제를 보내지 않고 YSP 태그를 엔진에 적용한다',async()=>{let requestBody:Record<string,unknown>={};const provider=createOpenAICompatibleProvider({endpoint:'https://test',apiKey:'k',model:'m',fetch:async(_u,init)=>{requestBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'금화를 얻었다. [ysp_gold::+100]'}}]}),{status:200});}}),profile=cardToRuntimeProject({name:'태그 카드',card:{data:{name:'태그 카드',description:'[ysp_gold::+1]'}},embeddedModules:[]}),runtime=new ProjectRuntime(profile.project),before=Number(runtime.state.gold??0),session=new PlaySession({id:'t',runtime,provider,preset,card:profile.card,tagTranslator:translateYspTags});await session.send('시작');expect(requestBody).not.toHaveProperty('response_format');expect(session.messages.at(-1)?.content).toContain('금화를 얻었다.');expect(Number(runtime.state.gold)).toBe(before+100);});
it('JSON 모드에서 강제 형식과 events를 파싱한다',async()=>{let body:Record<string,unknown>={};const provider=createOpenAICompatibleProvider({endpoint:'x',apiKey:'',model:'m',fetch:async(_u,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"text":"ok","events":[{"id":"x"}]}'}}]}),{status:200});}});expect((await provider.complete({prompt,format:'json'})).events).toEqual([{id:'x'}]);expect(body).toHaveProperty('response_format');});
it('깨진 JSON은 원문으로 폴백한다',async()=>{const provider=createOpenAICompatibleProvider({endpoint:'x',apiKey:'',model:'m',fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:'{broken'}}]}),{status:200})});expect(await provider.complete({prompt,format:'json'})).toEqual({text:'{broken',events:[]});});});
describe('Anthropic',()=>{it('system을 분리하고 텍스트 블록을 병합한다',async()=>{let body:any;const provider=createAnthropicProvider({apiKey:'k',model:'m',fetch:async(_u,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({content:[{type:'text',text:'A'},{type:'tool_use'},{type:'text',text:'B'}]}),{status:200});}});expect((await provider.complete({prompt,format:'prose'})).text).toBe('AB');expect(body.system).toBe('규칙');expect(body.messages.every((m:any)=>m.role!=='system')).toBe(true);});});
describe('Gemini',()=>{it('contents와 systemInstruction을 분리한다',async()=>{let body:any;const provider=createGoogleProvider({apiKey:'k',model:'m',fetch:async(_u,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'답'}]}}]}),{status:200});}});expect((await provider.complete({prompt,format:'prose'})).text).toBe('답');expect(body.systemInstruction.parts[0].text).toBe('규칙');expect(body.contents[0].role).toBe('user');});it('차단 이유를 오류로 낸다',async()=>{const provider=createGoogleProvider({apiKey:'k',model:'m',fetch:async()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}),{status:200})});await expect(provider.complete({prompt,format:'prose'})).rejects.toThrow('model_blocked:SAFETY');});});
describe('공식 모델 목록',()=>{it('Anthropic 계정의 표시명과 호출명을 함께 불러온다',async()=>{let headers:HeadersInit|undefined;const models=await fetchModels({provider:'anthropic',model:'old',apiKey:'secret'},async(_url,init)=>{headers=init?.headers;return new Response(JSON.stringify({data:[{id:'claude-opus-4-6',display_name:'Claude Opus 4.6'}]}),{status:200});});expect(models).toEqual([{id:'claude-opus-4-6',label:'Claude Opus 4.6'}]);expect(headers).toMatchObject({'x-api-key':'secret','anthropic-version':'2023-06-01'});});it('Gemini에서 generateContent 지원 모델만 불러온다',async()=>{const models=await fetchModels({provider:'google',model:'old',apiKey:'AIza-secret'},async url=>{expect(String(url)).toContain('/v1beta/models');return new Response(JSON.stringify({models:[{name:'models/gemini-3.5-flash',displayName:'Gemini 3.5 Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-embedding-2',supportedGenerationMethods:['embedContent']}]}),{status:200});});expect(models).toEqual([{id:'gemini-3.5-flash',label:'Gemini 3.5 Flash'}]);});it('조회 실패 시에도 직접 선택 가능한 기본 목록을 보존한다',async()=>{const models=await fetchModels({provider:'anthropic',model:'custom-model',apiKey:'bad'},async()=>new Response('no',{status:401}));expect(models.length).toBeGreaterThan(0);});});
describe('키 순환',()=>{it('401 뒤 다음 키로 한 번 재시도하고 양쪽 키를 마스킹한다',async()=>{const keys:string[]=[];const provider=createProvider({provider:'openai',model:'m',apiKey:'first-secret-key\nsecond-secret-key'},async(_u,init)=>{const key=String((init?.headers as Record<string,string>).authorization).replace('Bearer ','');keys.push(key);return new Response(`${key} rejected`,{status:key.startsWith('first')?401:429});});await expect(provider.complete({prompt,format:'prose'})).rejects.not.toThrow(/first-secret-key|second-secret-key/);expect(keys).toEqual(['first-secret-key','second-secret-key']);});});
describe('CPM 계열 공식 엔드포인트',()=>{it.each([
  ['openrouter','https://openrouter.ai/api/v1/chat/completions'],['deepseek','https://api.deepseek.com/v1/chat/completions'],['vercel','https://ai-gateway.vercel.sh/v1/chat/completions'],['nanogpt','https://nano-gpt.com/api/v1/chat/completions'],['cerebras','https://api.cerebras.ai/v1/chat/completions']
] as const)('%s가 Bearer 인증으로 산문을 호출한다',async(providerId,endpoint)=>{let seenUrl='',auth='';const provider=createProvider({provider:providerId,model:'m',apiKey:'provider-key'},async(url,init)=>{seenUrl=String(url);auth=String((init?.headers as Record<string,string>).authorization);return new Response(JSON.stringify({choices:[{message:{content:'산문 응답'}}]}),{status:200});});expect((await provider.complete({prompt,format:'prose'})).text).toBe('산문 응답');expect(seenUrl).toBe(endpoint);expect(auth).toBe('Bearer provider-key');});
it('Copilot OAuth 토큰을 단기 토큰으로 교환해 채팅한다',async()=>{const calls:string[]=[];const provider=createProvider({provider:'copilot',model:'gpt-4.1',apiKey:'gho_abcdefghijklmno'},async(url,init)=>{calls.push(String(url));if(String(url).includes('copilot_internal')){expect((init?.headers as Record<string,string>).authorization).toContain('gho_');return new Response(JSON.stringify({token:'tid=short-secret-token',expires_at:Math.floor(Date.now()/1000)+900}),{status:200});}expect((init?.headers as Record<string,string>).authorization).toBe('Bearer tid=short-secret-token');expect((init?.headers as Record<string,string>)['Copilot-Integration-Id']).toBe('vscode-chat');return new Response(JSON.stringify({choices:[{message:{content:'코파일럿 답변'}}]}),{status:200});});expect((await provider.complete({prompt,format:'prose'})).text).toBe('코파일럿 답변');expect(calls).toEqual(['https://api.github.com/copilot_internal/v2/token','https://api.githubcopilot.com/chat/completions']);});});

describe('Copilot 필수 에디터 헤더',()=>{
  // Copilot API는 Editor-Version/Editor-Plugin-Version이 없으면 요청을 거부한다.
  // CPM(v1.35.11)이 실제로 보내는 헤더 집합과 일치해야 첫 요청이 성공한다.
  it('토큰 교환·채팅·모델 목록 모두에 에디터 신원 헤더를 보낸다',async()=>{
    const seen:Array<Record<string,string>>=[];
    const fetchImpl=(async(url:string|URL,init?:RequestInit)=>{
      seen.push({url:String(url),...(init?.headers as Record<string,string>??{})});
      if(String(url).includes('copilot_internal'))return new Response(JSON.stringify({token:'tid=abc;exp=1',expires_at:Math.floor(Date.now()/1000)+3600,endpoints:{api:'https://api.individual.githubcopilot.com'}}),{status:200});
      return new Response(JSON.stringify({choices:[{message:{content:'좋은 아침 [ysp_gold::+5]'}}]}),{status:200});
    }) as unknown as typeof fetch;
    const provider=createProvider({provider:'copilot',model:'gpt-4.1',apiKey:'gho_test_token_1234567890'},fetchImpl);
    const result=await provider.complete({prompt:{messages:[{role:'user',content:'안녕'}]} as never,format:'prose'});
    expect(result.text).toContain('[ysp_gold::+5]');
    const token=seen.find(x=>(x.url??'').includes('copilot_internal'))!,chat=seen.find(x=>(x.url??'').includes('/chat/completions'))!;
    expect(token['Editor-Version']).toBe('vscode/1.115.0');
    expect(chat['Editor-Version']).toBe('vscode/1.115.0');
    expect(chat['Editor-Plugin-Version']).toContain('copilot-chat/');
    expect(chat['Copilot-Integration-Id']).toBe('vscode-chat');
    expect(chat['X-Initiator']).toBe('user');
    expect(chat.url).toContain('api.individual.githubcopilot.com'); // 토큰 응답의 endpoints.api를 따른다
  });
});

describe('Ollama 이식 — CPM 참조(코드 미복사)', () => {
  it('기본은 로컬 OpenAI 호환 엔드포인트, Base URL을 주면 정규화해 쓴다', () => {
    expect(ollamaEndpoint('')).toBe('http://localhost:11434/v1/chat/completions');
    expect(ollamaEndpoint('http://192.168.0.5:11434')).toBe('http://192.168.0.5:11434/v1/chat/completions');
    expect(ollamaEndpoint('https://ollama.com/')).toBe('https://ollama.com/api/chat');
    expect(ollamaEndpoint('https://ollama.com/v1/chat/completions')).toBe('https://ollama.com/api/chat');
  });
  it('로컬 Ollama는 API 키 없이 프로바이더가 만들어진다(자리표시자 Bearer)', () => {
    expect(() => createProvider({ provider: 'ollama', model: 'llama3.3', apiKey: '' })).not.toThrow();
    expect(() => createProvider({ provider: 'openai', model: 'gpt-5.6', apiKey: '' })).toThrow('api_key_required');
  });
  it('Ollama Cloud는 공식 /api/chat 계약과 native 응답 형식을 사용한다', async () => {
    let called = '', sent: Record<string, unknown> = {}, headers: HeadersInit | undefined;
    const provider = createProvider({ provider: 'ollama', model: 'qwen3', apiKey: 'cloud-key', endpoint: 'https://ollama.com' }, (async (input, init) => {
      called = String(input); sent = JSON.parse(String(init?.body)); headers = init?.headers;
      return new Response(JSON.stringify({ message: { role: 'assistant', content: '{"text":"cloud ok","events":[]}' }, done: true }), { status: 200 });
    }) as typeof fetch);
    await expect(provider.complete({ prompt: { messages: [{ role: 'user', content: 'hi' }], assistantPrefill: '', trace: [], warnings: [] } })).resolves.toMatchObject({ text: 'cloud ok' });
    expect(called).toBe('https://ollama.com/api/chat');
    expect(sent).toMatchObject({ model: 'qwen3', stream: false });
    expect(headers).toMatchObject({ authorization: 'Bearer cloud-key' });
  });
  it('모델 목록은 /v1/models 실패 시 네이티브 /api/tags로 폴백한다', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (url.endsWith('/v1/models')) return new Response('nope', { status: 404 });
      if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'llama3.3:70b' }, { name: 'qwen3:32b' }] }), { status: 200 });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const models = await fetchModels({ provider: 'ollama', model: '', apiKey: '' }, fetchImpl);
    expect(models.map((m) => m.id)).toEqual(['llama3.3:70b', 'qwen3:32b']);
    expect(calls.some((url) => url.endsWith('/api/tags'))).toBe(true);
  });
  it('둘 다 실패하면 정적 카탈로그로 폴백한다', async () => {
    const fetchImpl = (async () => new Response('down', { status: 500 })) as typeof fetch;
    const models = await fetchModels({ provider: 'ollama', model: '', apiKey: '' }, fetchImpl);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]!.id).toBe('llama3.3');
  });
});
