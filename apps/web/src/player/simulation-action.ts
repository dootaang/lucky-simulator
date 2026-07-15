export type SimulationActionMode='narrated'|'ledger'|'scene';
export interface SimulationActionRequest{id:string;params:Record<string,unknown>;mode:SimulationActionMode;intent?:string;events?:Array<{id:string;params:Record<string,unknown>}>;}
export type SimulationActionHandler=(request:SimulationActionRequest)=>Promise<Record<string,unknown>[]>;
export function declaredActionMode(action:Record<string,unknown>):SimulationActionMode{return action.narrate===false||action.mode==='ledger'?'ledger':'narrated';}
