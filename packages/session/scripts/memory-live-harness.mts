import {MemoryLedger} from '@simbot/memory';
import {defaultCardPreset} from '@simbot/risu';
import {ProjectRuntime} from '@simbot/runtime';
import {PlaySession,type ModelProvider} from '../src/index.ts';

const endpoint=process.env.SIMBOT_MEMORY_LIVE_URL?.trim(),apiKey=process.env.SIMBOT_MEMORY_LIVE_KEY?.trim(),model=process.env.SIMBOT_MEMORY_LIVE_MODEL?.trim(),turns=Math.max(5,Math.min(300,Number(process.env.SIMBOT_MEMORY_LIVE_TURNS??30)||30));
if(!endpoint||!apiKey||!model){
  console.log('실모델 장기기억 하니스 (호출은 명시적으로 환경변수를 넣었을 때만 실행)');
  console.log('SIMBOT_MEMORY_LIVE_URL=https://.../v1/chat/completions');
  console.log('SIMBOT_MEMORY_LIVE_KEY=...  SIMBOT_MEMORY_LIVE_MODEL=...  SIMBOT_MEMORY_LIVE_TURNS=30');
  process.exit(0);
}

const provider:ModelProvider={async complete({prompt,signal}){const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,messages:prompt.messages,temperature:0}),signal});if(!response.ok)throw new Error(`live_provider_${response.status}`);const data=await response.json() as {choices?:Array<{message?:{content?:string}}>};return{text:String(data.choices?.[0]?.message?.content??'')};}};
const runtime=()=>new ProjectRuntime({projectId:'memory-live-harness',schema:{entities:[{type:'npc',instances:[{id:'silvia',nameKo:'실비아'}]}],initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]});
const memory=new MemoryLedger(),session=new PlaySession({id:'memory-live',runtime:runtime(),memory,preset:defaultCardPreset(),card:{name:'장기기억 시험'},provider,tagTranslator:(text)=>({events:[],residue:text})});
const expected:string[]=[];
for(let turn=1;turn<=turns;turn+=1){const marker=`표식-${String(turn).padStart(3,'0')}`,sentence=`${marker}을 기억해. 실비아와 ${turn}번째 귀환 약속을 한다.`;expected.push(marker);await session.send(sentence);}
const active=session.memory.allStored(),approved=active.filter(record=>record.status==='approved'),captured=expected.filter(marker=>active.some(record=>record.text.includes(marker))),snapshot=session.snapshot(),restored=new PlaySession({id:'memory-live',runtime:runtime(),preset:defaultCardPreset(),card:{name:'장기기억 시험'},provider,tagTranslator:(text)=>({events:[],residue:text})});restored.restore(snapshot);
console.log(JSON.stringify({turns,captured:captured.length,captureRate:captured.length/turns,approved:approved.length,candidates:active.filter(record=>record.status==='candidate').length,restoredExactly:JSON.stringify(restored.memory.allStored())===JSON.stringify(active),promptRuns:session.promptRuns.length},null,2));
