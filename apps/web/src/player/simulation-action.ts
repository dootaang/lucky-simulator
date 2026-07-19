export type SimulationActionMode='narrated'|'ledger'|'scene';
export type SimulationActionPhase='session-start'|'checkpoint-complete'|'engine-complete'|'memory-complete'|'prompt-complete'|'provider-complete'|'receipt-complete'|'save-start'|'save-complete';
export type SimulationActionTrace=(phase:SimulationActionPhase,at:number)=>void;
export interface SimulationActionRequest{id:string;params:Record<string,unknown>;mode:SimulationActionMode;intent?:string;events?:Array<{id:string;params:Record<string,unknown>}>;trace?:SimulationActionTrace;}
export type SimulationActionHandler=(request:SimulationActionRequest)=>Promise<Record<string,unknown>[]>;
export function declaredActionMode(action:Record<string,unknown>):SimulationActionMode{return action.narrate===false||action.mode==='ledger'?'ledger':'narrated';}
// Svelte의 상태 변경을 브라우저가 실제로 한 프레임 그린 뒤 엔진 작업을 시작한다.
// requestAnimationFrame이 없는 테스트/SSR 환경은 다음 태스크로만 양보한다.
export function yieldForActionPaint(){return new Promise<void>(resolve=>{const raf=globalThis.requestAnimationFrame;if(typeof raf==='function')raf(()=>resolve());else setTimeout(resolve,0);});}
