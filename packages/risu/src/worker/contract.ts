import type{CardTriggerInput,CardTriggerResult}from'../trigger-runtime.ts';
export type CardStateOwnership='card'|'engine';
export interface CardRuntimeSnapshot{sessionId:string;cardId:string;revision:string;variables:Record<string,string>;randomState:number;logicalTimeMs:number;stateOwnership:CardStateOwnership}
export interface VariablePatch{op:'set'|'delete';key:string;value?:string}
export interface RuntimeEffect{type:string;disposition:'apply'|'block'|'approval';payload:Record<string,unknown>}
export interface RuntimeWarning{code:string;message:string;effect?:string;actual?:number;limit?:number}
export interface RuntimeWorkerTriggerRequest{type:'trigger';requestId:string;snapshot:CardRuntimeSnapshot;input:Omit<CardTriggerInput,'variables'|'alert'>}
export interface RuntimeWorkerLuaRequest{type:'lua';requestId:string;snapshot:CardRuntimeSnapshot;code:string;capabilities?:{lua?:boolean}}
export type RuntimeWorkerRequest=RuntimeWorkerTriggerRequest|RuntimeWorkerLuaRequest;
export interface RuntimeWorkerSuccess{type:'result';ok:true;requestId:string;sessionId:string;cardId:string;baseRevision:string;patch:VariablePatch[];effects:RuntimeEffect[];warnings:RuntimeWarning[];result:Pick<CardTriggerResult,'displayData'|'stopSending'|'ephemeral'>;randomState:number;logicalTimeMs:number;durationMs:number}
export interface RuntimeWorkerFailure{type:'result';ok:false;requestId:string;sessionId:string;cardId:string;baseRevision:string;error:string;warnings:RuntimeWarning[];durationMs:number}
export type RuntimeWorkerResponse=RuntimeWorkerSuccess|RuntimeWorkerFailure;
export interface RuntimeWorkerReady{type:'ready';requestId:string;phase:'lua'}
export type RuntimeWorkerMessage=RuntimeWorkerResponse|RuntimeWorkerReady;
export interface RuntimeClientWarning{code:'runtime_timeout'|'runtime_disposed'|'runtime_stale_response'|'runtime_worker_error'|'runtime_budget_rejected'|'runtime_soft_timeout'|'runtime_effect_blocked'|'runtime_effect_approval'|'runtime_state_write_blocked'|'runtime_lua_disabled'|'runtime_lua_capability_blocked'|'runtime_lua_instruction_limit'|'runtime_lua_error';requestId:string;message:string}
