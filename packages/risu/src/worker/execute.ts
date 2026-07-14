import{runCardTriggers}from'../trigger-runtime.ts';
import{prepareRuntimeEffects}from'../security/effect-policy.ts';
import{RUNTIME_LIMITS,RuntimeBudgetExceeded,RuntimeExecutionBudget,validateRuntimeRequest,validateRuntimeResponse,withRuntimeExecutionBudget}from'../security/runtime-budget.ts';
import type{RuntimeWorkerRequest,RuntimeWorkerResponse,VariablePatch}from'./contract.ts';
import{RuntimeDeterminism}from'./determinism.ts';
import{executeLua}from'./lua.ts';

const diff=(before:Record<string,string>,after:Record<string,string>):VariablePatch[]=>{const out:VariablePatch[]=[];for(const[key,value]of Object.entries(after))if(before[key]!==value)out.push({op:'set',key,value});for(const key of Object.keys(before))if(!Object.hasOwn(after,key))out.push({op:'delete',key});return out;};
export async function executeRuntimeRequest(request:RuntimeWorkerRequest,onLuaReady:()=>void=()=>{}):Promise<RuntimeWorkerResponse>{
 const started=Date.now(),warnings:RuntimeWorkerResponse['warnings']=[],budget=new RuntimeExecutionBudget(),determinism=new RuntimeDeterminism(request.snapshot.randomState,request.snapshot.logicalTimeMs);
 try{
  validateRuntimeRequest(request);
  if(request.type==='lua'){
   let executionStarted=started;const result=await executeLua(request,()=>{executionStarted=Date.now();onLuaReady();});warnings.push(...result.warnings);
   const calculatedPatch=result.patch,patch=request.snapshot.stateOwnership==='engine'?[]:calculatedPatch;
   if(request.snapshot.stateOwnership==='engine'&&calculatedPatch.length)warnings.push({code:'runtime_state_write_blocked',message:`engine_owned_state:${calculatedPatch.length}`,actual:calculatedPatch.length,limit:0});
   const durationMs=Date.now()-executionStarted;if(durationMs>RUNTIME_LIMITS.softMs)warnings.push({code:'runtime_soft_timeout',message:`runtime_soft_timeout:${durationMs}`,actual:durationMs,limit:RUNTIME_LIMITS.softMs});
   const response:RuntimeWorkerResponse={type:'result',ok:true,requestId:request.requestId,sessionId:request.snapshot.sessionId,cardId:request.snapshot.cardId,baseRevision:request.snapshot.revision,patch,effects:[],warnings,result:{displayData:null,stopSending:false,ephemeral:{}},randomState:request.snapshot.randomState,logicalTimeMs:request.snapshot.logicalTimeMs,durationMs};validateRuntimeResponse(response);return response;
  }
  const prepared=prepareRuntimeEffects(request.input);warnings.push(...prepared.warnings);
  const result=await withRuntimeExecutionBudget(budget,()=>runCardTriggers({...prepared.input,variables:{...request.snapshot.variables},random:determinism.random,now:determinism.now,alert:(kind,message)=>warnings.push({code:kind==='error'?'trigger_error':'trigger_notice',message})})),durationMs=Date.now()-started,calculatedPatch=diff(request.snapshot.variables,result.variables),patch=request.snapshot.stateOwnership==='engine'?[]:calculatedPatch;
  if(request.snapshot.stateOwnership==='engine'&&calculatedPatch.length)warnings.push({code:'runtime_state_write_blocked',message:`engine_owned_state:${calculatedPatch.length}`,actual:calculatedPatch.length,limit:0});
  if(durationMs>RUNTIME_LIMITS.softMs)warnings.push({code:'runtime_soft_timeout',message:`runtime_soft_timeout:${durationMs}`,effect:budget.lastEffect,actual:durationMs,limit:RUNTIME_LIMITS.softMs});
  const response:RuntimeWorkerResponse={type:'result',ok:true,requestId:request.requestId,sessionId:request.snapshot.sessionId,cardId:request.snapshot.cardId,baseRevision:request.snapshot.revision,patch,effects:prepared.effects,warnings,result:{displayData:result.displayData,stopSending:result.stopSending,ephemeral:result.ephemeral},randomState:determinism.state,logicalTimeMs:determinism.nextLogicalTimeMs,durationMs};validateRuntimeResponse(response);return response;
 }catch(error){if(error instanceof RuntimeBudgetExceeded)warnings.push({code:'runtime_budget_exceeded',message:error.message,effect:error.effect,actual:error.actual,limit:error.allowed});return{type:'result',ok:false,requestId:request.requestId,sessionId:request.snapshot.sessionId,cardId:request.snapshot.cardId,baseRevision:request.snapshot.revision,error:error instanceof Error?error.message:String(error),warnings,durationMs:Date.now()-started};}
}
