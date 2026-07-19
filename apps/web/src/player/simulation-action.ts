export type SimulationActionMode='narrated'|'ledger'|'scene';
export type SimulationActionPhase='session-start'|'checkpoint-complete'|'engine-complete'|'memory-complete'|'prompt-complete'|'provider-complete'|'receipt-complete'|'save-start'|'save-complete';
export type SimulationActionTrace=(phase:SimulationActionPhase,at:number)=>void;
export interface SimulationActionRequest{id:string;params:Record<string,unknown>;mode:SimulationActionMode;intent?:string;events?:Array<{id:string;params:Record<string,unknown>}>;trace?:SimulationActionTrace;}
export type SimulationActionHandler=(request:SimulationActionRequest)=>Promise<Record<string,unknown>[]>;
export function declaredActionMode(action:Record<string,unknown>):SimulationActionMode{return action.narrate===false||action.mode==='ledger'?'ledger':'narrated';}
