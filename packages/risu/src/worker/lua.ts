/// <reference path="../assets.d.ts" />
import{RUNTIME_LIMITS}from'../security/runtime-budget.ts';
import type{RuntimeWarning,RuntimeWorkerLuaRequest,VariablePatch}from'./contract.ts';

const BLOCKED_APIS=['request','LLM','axLLM','LLMMain','axLLMMain','simpleLLM','generateImage','getChat','getChatMain','getFullChat','getFullChatMain','setFullChat','setFullChatMain','setChat','setChatRole','cutChat','removeChat','addChat','insertChat','getLoreBooks','getLoreBooksMain','loadLoreBooks','loadLoreBooksMain','upsertLocalLoreBook','getCharacterImage','getCharacterImageMain','getPersonaImage','getPersonaImageMain','setName','setDescription','setBackgroundEmbedding','stopChat','reloadDisplay','reloadChat','readFile','writeFile','dispatchEngineEvent']as const;
const safeKey=(value:string)=>!!value&&!['__proto__','prototype','constructor'].includes(value);
const LUA_PREAMBLE=`
local __lucky_count = 0
debug.sethook(function()
  __lucky_count = __lucky_count + 1000
  if __lucky_count > ${RUNTIME_LIMITS.luaInstructions} then error("runtime_lua_instruction_limit", 0) end
end, "", 1000)
io=nil; os=nil; package=nil; require=nil; dofile=nil; loadfile=nil; load=nil; debug=nil
function getState(id, name) return getChatVar(id, "__"..tostring(name)) end
function setState(id, name, value) return setChatVar(id, "__"..tostring(name), value) end
`;

export interface LuaExecutionResult{patch:VariablePatch[];warnings:RuntimeWarning[]}
export async function executeLua(request:RuntimeWorkerLuaRequest,onReady:()=>void=()=>{}):Promise<LuaExecutionResult>{
 if(request.capabilities?.lua!==true)return{patch:[],warnings:[{code:'runtime_lua_disabled',message:'lua_capability_disabled'}]};
 const variables=new Map(Object.entries(request.snapshot.variables)),warnings:RuntimeWarning[]=[];let blocked='';
 const loaded=await import('wasmoon'),LuaFactory=loaded.LuaFactory??(loaded as unknown as{default?:{LuaFactory?:typeof loaded.LuaFactory}}).default?.LuaFactory??(globalThis as unknown as{wasmoon?:{LuaFactory?:typeof loaded.LuaFactory}}).wasmoon?.LuaFactory;if(!LuaFactory)throw new Error('runtime_lua_factory_missing');const browserWasmUri=typeof(globalThis as{location?:unknown}).location==='object'?(await import('wasmoon/dist/glue.wasm?url')).default:undefined,engine=await new LuaFactory(browserWasmUri).createEngine({openStandardLibs:true,injectObjects:false,enableProxy:false,traceAllocations:true});/* ?url 임포트는 Vite 전용 — 정적 임포트로 두면 플레인 Node(런타임 카나리아)가 @simbot/risu를 임포트하지 못한다. 브라우저 분기 안 동적 임포트만 허용. */
 engine.global.setMemoryMax(RUNTIME_LIMITS.luaMemoryBytes);
 const get=(key:unknown)=>variables.get(String(key))??'';
 const set=(key:unknown,value:unknown)=>{const name=String(key);if(!safeKey(name))throw new Error('runtime_lua_unsafe_variable');variables.set(name,String(value??''));};
 const deny=(name:string)=>{blocked=name;throw new Error(`runtime_lua_capability_blocked:${name}`);};
 engine.global.set('getChatVar',(_id:unknown,key:unknown)=>get(key));engine.global.set('setChatVar',(_id:unknown,key:unknown,value:unknown)=>set(key,value));
 engine.global.set('getvar',(key:unknown)=>get(key));engine.global.set('setvar',(key:unknown,value:unknown)=>set(key,value));
 for(const name of BLOCKED_APIS)engine.global.set(name,()=>deny(name));
 try{
  onReady();
  await engine.doString(`${LUA_PREAMBLE}\n${request.code}`);
  if(blocked)throw new Error(`runtime_lua_capability_blocked:${blocked}`);
  const after=Object.fromEntries(variables),patch:VariablePatch[]=[];
  for(const[key,value]of Object.entries(after))if(request.snapshot.variables[key]!==value)patch.push({op:'set',key,value});
  for(const key of Object.keys(request.snapshot.variables))if(!Object.hasOwn(after,key))patch.push({op:'delete',key});
  return{patch,warnings};
 }catch(error){const message=error instanceof Error?error.message:String(error);if(blocked||message.includes('runtime_lua_capability_blocked'))warnings.push({code:'runtime_lua_capability_blocked',message:`runtime_lua_capability_blocked:${blocked||'unknown'}`,...(blocked?{effect:blocked}:{})});else if(message.includes('runtime_lua_instruction_limit'))warnings.push({code:'runtime_lua_instruction_limit',message:'runtime_lua_instruction_limit',actual:RUNTIME_LIMITS.luaInstructions+1,limit:RUNTIME_LIMITS.luaInstructions});else warnings.push({code:'runtime_lua_error',message});return{patch:[],warnings};}
 finally{engine.global.close();}
}
