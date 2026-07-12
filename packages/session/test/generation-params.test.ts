import{describe,expect,it}from'vitest';
import{createAnthropicProvider}from'../src/providers/anthropic.ts';
import{createGoogleProvider}from'../src/providers/google.ts';
import{createOpenAICompatibleProvider}from'../src/providers/openai.ts';
import{PlaySession,type ModelProvider}from'../src/index.ts';
import{ProjectRuntime}from'@simbot/runtime';
import{defaultCardPreset}from'@simbot/risu';

const prompt={messages:[{role:'system' as const,content:'system'},{role:'user' as const,content:'hello'}],assistantPrefill:'',trace:[],warnings:[]};
const response=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});

describe('provider generation parameters',()=>{
  it('OpenAI compatible providers forward supported snake-case fields',async()=>{let sent:Record<string,unknown>={};const provider=createOpenAICompatibleProvider({endpoint:'https://example.test/chat',apiKey:'k',model:'m',topP:.7,frequencyPenalty:.2,presencePenalty:.3,seed:42,fetch:async(_url,init)=>{sent=JSON.parse(String(init?.body));return response({choices:[{message:{content:'ok'}}]});}});await provider.complete({prompt,format:'prose'});expect(sent).toMatchObject({top_p:.7,frequency_penalty:.2,presence_penalty:.3,seed:42});expect(sent).not.toHaveProperty('temperature');});
  it('Anthropic forwards top_p/top_k and never OpenAI penalty fields',async()=>{let sent:Record<string,unknown>={};const provider=createAnthropicProvider({apiKey:'k',model:'m',topP:.8,topK:30,fetch:async(_url,init)=>{sent=JSON.parse(String(init?.body));return response({content:[{type:'text',text:'ok'}]});}});await provider.complete({prompt,format:'prose'});expect(sent).toMatchObject({top_p:.8,top_k:30});expect(sent).not.toHaveProperty('frequency_penalty');expect(sent).not.toHaveProperty('presence_penalty');expect(sent).not.toHaveProperty('temperature');});
  it('Gemini forwards generationConfig topP/topK/seed without penalties',async()=>{let sent:Record<string,unknown>={};const provider=createGoogleProvider({apiKey:'k',model:'m',topP:.9,topK:20,seed:7,fetch:async(_url,init)=>{sent=JSON.parse(String(init?.body));return response({candidates:[{content:{parts:[{text:'ok'}]}}]});}});await provider.complete({prompt,format:'prose'});expect(sent.generationConfig).toMatchObject({topP:.9,topK:20,seed:7});expect(sent.generationConfig).not.toHaveProperty('frequencyPenalty');expect(sent.generationConfig).not.toHaveProperty('temperature');});
});

describe('maxContext',()=>{it('drops oldest chat text first and always retains the newest user message',async()=>{const prompts:string[]=[];const provider:ModelProvider={async complete({prompt}){prompts.push(prompt.messages.map(message=>message.content).join('\n'));return{text:'assistant '.repeat(12)};}},runtime=new ProjectRuntime({projectId:'context',schema:{initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]}),session=new PlaySession({id:'context',runtime,provider,preset:defaultCardPreset(),card:{name:'C'},maxContext:12});await session.send(`OLD-${'x'.repeat(80)}`);await session.send('LATEST');const last=prompts.at(-1)!;expect(last).toContain('LATEST');expect(last).not.toContain('OLD-');});});
