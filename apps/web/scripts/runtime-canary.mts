import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCardDocument,parseCard,type ParsedCard} from '@simbot/card';
import {
  executeRuntimeRequest,
  RUNTIME_LIMITS,
  type CardStateOwnership,
  type CardTriggerMode,
  type CardTriggerScript,
  type RuntimeWarning,
  type RuntimeWorkerResponse,
} from '@simbot/risu';

const cardPath=process.argv.slice(2).find(argument=>argument!=='--');
if(!cardPath)throw new Error('사용법: pnpm --filter @simbot/web canary:runtime -- <카드 경로>');

const RANDOM_STATE=0x5eed2026;
const LOGICAL_TIME_MS=1_750_000_000_000;
const MODES:readonly CardTriggerMode[]=['start','manual','output','input','display','request'];

type CountMap=Record<string,number>;
type TriggerRecord=CardTriggerScript&Record<string,unknown>;

const count=(values:readonly string[])=>values.reduce<CountMap>((result,value)=>{result[value]=(result[value]??0)+1;return result;},{});
const sorted=(values:Iterable<string>)=>[...new Set(values)].sort((a,b)=>a.localeCompare(b));
const warningCounts=(warnings:readonly RuntimeWarning[])=>count(warnings.map(warning=>warning.code));
const blockedEffects=(warnings:readonly RuntimeWarning[])=>sorted(warnings.flatMap(warning=>warning.effect?[warning.effect]:[]));
const responsePatchCount=(responses:readonly RuntimeWorkerResponse[])=>responses.reduce((sum,response)=>sum+(response.ok?response.patch.length:0),0);
const responseWarnings=(responses:readonly RuntimeWorkerResponse[])=>responses.flatMap(response=>response.warnings);
const responseDuration=(responses:readonly RuntimeWorkerResponse[])=>responses.reduce((sum,response)=>sum+response.durationMs,0);

function readTriggers(parsed:ParsedCard):TriggerRecord[]{
  return createCardDocument(parsed).draft.triggerScripts.map(trigger=>trigger as TriggerRecord);
}

function readLua(triggers:readonly TriggerRecord[]):string[]{
  return triggers.flatMap(trigger=>(Array.isArray(trigger.effect)?trigger.effect:[]).flatMap(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return[];
    const effect=raw as Record<string,unknown>;
    return effect.type==='triggerlua'&&typeof effect.code==='string'&&effect.code.length?[effect.code]:[];
  }));
}

function scanLuaApis(chunks:readonly string[]):string[]{
  const calls=new Set<string>(),ignored=new Set(['and','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while']);
  for(const chunk of chunks){
    const code=chunk
      .replace(/--\[\[[\s\S]*?\]\]/g,' ')
      .replace(/--[^\r\n]*/g,' ')
      .replace(/\[(=*)\[[\s\S]*?\]\1\]/g,' ')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' ');
    const declared=new Set([...code.matchAll(/\b(?:local\s+)?function\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(/g)].map(match=>match[1]!.replaceAll(':','.')));
    const matcher=/\b([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(/g;
    let match:RegExpExecArray|null;
    while((match=matcher.exec(code))){
      const name=match[1]!.replaceAll(':','.'),prefix=code.slice(Math.max(0,match.index-12),match.index);
      if(!ignored.has(name)&&!declared.has(name)&&!/function\s+$/.test(prefix))calls.add(name);
    }
  }
  return sorted(calls);
}

function defaultVariables(parsed:ParsedCard):Record<string,string>{
  return Object.assign({},...(parsed.modules??[]).map(module=>module.defaultVariables));
}

function snapshot(ownership:CardStateOwnership,variables:Record<string,string>){
  return{sessionId:'runtime-canary-session',cardId:'runtime-canary-card',revision:'runtime-canary-revision',variables:{...variables},randomState:RANDOM_STATE,logicalTimeMs:LOGICAL_TIME_MS,stateOwnership:ownership};
}

async function runDeclarative(triggers:readonly TriggerRecord[],variables:Record<string,string>,ownership:CardStateOwnership){
  const responses:RuntimeWorkerResponse[]=[];
  for(const mode of MODES){
    const active=triggers.filter(trigger=>trigger.type===mode);
    if(!active.length)continue;
    responses.push(await executeRuntimeRequest({
      type:'trigger',requestId:`declarative-${ownership}-${mode}`,snapshot:snapshot(ownership,variables),
      input:{mode,triggers:active,messages:[],displayData:mode==='display'?'':undefined},
    }));
  }
  const warnings=responseWarnings(responses);
  return{
    report:{requests:responses.length,successes:responses.filter(response=>response.ok).length,patches:responsePatchCount(responses),warningCounts:warningCounts(warnings),blockedEffects:blockedEffects(warnings)},
    deterministic:responses.map(({durationMs,...response})=>response),
  };
}

async function runLua(chunks:readonly string[],variables:Record<string,string>,ownership:CardStateOwnership){
  const responses:RuntimeWorkerResponse[]=[],preparationMs:number[]=[];
  for(const[index,code]of chunks.entries()){
    const started=performance.now();let readyAt:number|null=null;
    responses.push(await executeRuntimeRequest({
      type:'lua',requestId:`lua-${ownership}-${index}`,snapshot:snapshot(ownership,variables),code,capabilities:{lua:true},
    },()=>{readyAt=performance.now();}));
    preparationMs.push(readyAt===null?0:Math.max(0,readyAt-started));
  }
  const warnings=responseWarnings(responses),codes=warningCounts(warnings);
  return{
    report:{
      requests:responses.length,successes:responses.filter(response=>response.ok).length,patches:responsePatchCount(responses),warningCounts:codes,
      blockedEffects:blockedEffects(warnings),durationMs:responseDuration(responses),wasmPreparationMs:Number(preparationMs.reduce((sum,value)=>sum+value,0).toFixed(3)),
      wasmPreparationSamplesMs:preparationMs.map(value=>Number(value.toFixed(3))),commandLimit:RUNTIME_LIMITS.luaInstructions,memoryLimitBytes:RUNTIME_LIMITS.luaMemoryBytes,
      commandLimitReached:(codes.runtime_lua_instruction_limit??0)>0,
      memoryLimitReached:warnings.some(warning=>warning.code==='runtime_lua_error'&&/memory/i.test(warning.message)),
    },
    deterministic:responses.map(({durationMs,...response})=>response),
  };
}

async function runSuite(triggers:readonly TriggerRecord[],lua:readonly string[],variables:Record<string,string>){
  const result={}as Record<CardStateOwnership,{declarative:Awaited<ReturnType<typeof runDeclarative>>;lua:Awaited<ReturnType<typeof runLua>>}>;
  for(const ownership of ['card','engine']as const)result[ownership]={declarative:await runDeclarative(triggers,variables,ownership),lua:await runLua(lua,variables,ownership)};
  return result;
}

const absolutePath=resolve(cardPath),cardBytes=new Uint8Array(await readFile(absolutePath)),parsed=parseCard(cardBytes,absolutePath),triggers=readTriggers(parsed),lua=readLua(triggers),variables=defaultVariables(parsed);
const first=await runSuite(triggers,lua,variables),second=await runSuite(triggers,lua,variables);
const deterministic=JSON.stringify(Object.fromEntries(Object.entries(first).map(([key,value])=>[key,{declarative:value.declarative.deterministic,lua:value.lua.deterministic}])))===JSON.stringify(Object.fromEntries(Object.entries(second).map(([key,value])=>[key,{declarative:value.declarative.deterministic,lua:value.lua.deterministic}])));
assert(deterministic,'고정 스냅샷의 결정론 필드가 두 실행에서 달라졌습니다.');

const report={
  card:{name:parsed.name,format:parsed.format,bytes:cardBytes.length},
  declarative:{count:triggers.length,typeDistribution:count(triggers.map(trigger=>String(trigger.type??'(missing)')))},
  lua:{present:lua.length>0,characters:lua.reduce((sum,code)=>sum+code.length,0),staticApis:scanLuaApis(lua)},
  execution:Object.fromEntries((['card','engine']as const).map(ownership=>[ownership,{declarative:first[ownership].declarative.report,lua:first[ownership].lua.report}])),
  stateOwnershipComparison:{cardPatches:first.card.declarative.report.patches+first.card.lua.report.patches,enginePatches:first.engine.declarative.report.patches+first.engine.lua.report.patches},
  limits:{luaCommands:RUNTIME_LIMITS.luaInstructions,trackedMemoryBytes:RUNTIME_LIMITS.luaMemoryBytes},
  determinism:{runs:2,randomState:RANDOM_STATE,logicalTimeMs:LOGICAL_TIME_MS,timingExcluded:true,matched:deterministic},
};
console.log(JSON.stringify(report,null,2));
