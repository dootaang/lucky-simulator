import type {SessionActionMode,SessionActionPhase,SessionActionRequest,SessionActionTrace} from '@simbot/session';
export type SimulationActionMode=SessionActionMode;
export type SimulationActionPhase=SessionActionPhase;
export type SimulationActionTrace=SessionActionTrace;
export type SimulationActionRequest=SessionActionRequest;
export type SimulationActionHandler=(request:SimulationActionRequest)=>Promise<Record<string,unknown>[]>;
export function declaredActionMode(action:Record<string,unknown>):SimulationActionMode{return action.narrate===false||action.mode==='ledger'?'ledger':'narrated';}
// Svelte의 상태 변경을 브라우저가 실제로 한 프레임 그린 뒤 엔진 작업을 시작한다.
// requestAnimationFrame이 없는 테스트/SSR 환경은 다음 태스크로만 양보한다.
export function yieldForActionPaint(){return new Promise<void>(resolve=>{const raf=globalThis.requestAnimationFrame;if(typeof raf==='function')raf(()=>resolve());else setTimeout(resolve,0);});}
