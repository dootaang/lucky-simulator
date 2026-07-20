import type {PlaySession} from '@simbot/session';
import {toFactLine} from './FactReceipt.svelte';
import {diagnostics} from './diagnostics.svelte.ts';

// 턴 흐름을 콘솔로 흘려보낸다(정보 레벨). 새 계측을 심지 않는다 — 세션은 이미 promptRuns에
// 프롬프트·모델·소요 시간·토큰·제안 이벤트·상태 해시·기억 결정을 다 들고 있다. 우리는 그걸 읽어서
// 사람이 읽는 줄로 바꿔 보낼 뿐이다. 그래서 이 파일은 세션을 건드리지 않고, 실패해도 플레이를 해치지 않는다.
//
// "눌렀는데 아무 일도 안 일어남"의 원인은 대개 이 넷 중 하나다. 그래서 넷을 각각 남긴다.
//   ① 프롬프트가 잘못 조립됐다  ② 모델이 이상하게 답했다  ③ 엔진이 이벤트를 차단했다  ④ 기억이 안 남았다
type Run=PlaySession['promptRuns'][number];
const KIND:Record<string,string>={send:'대화',reroll:'다시 굴리기',continue:'이어쓰기',management:'관리 행동'};
const ms=(value:number|undefined)=>value===undefined?'(모름)':`${Math.round(value)}ms`;
export function summarizeWarningCodes(warnings:readonly{code:string;detail?:string}[]){if(!warnings.length)return'없음';const counts=new Map<string,{count:number;detail:string|undefined}>();for(const warning of warnings){const current=counts.get(warning.code);counts.set(warning.code,{count:(current?.count??0)+1,detail:current?.detail??warning.detail});}return[...counts].map(([code,value])=>`${value.count>1?`${code} ×${value.count}`:code}${code==='sprite_catalog_truncated'&&value.detail?` (${value.detail})`:''}`).join(', ');}

export function traceRun(run:Run,card:string,chat:string,message:number|null){
  const where={card,chat,message,turn:run.turn} as const;
  const kind=KIND[run.kind]??run.kind,key=`run:${chat}:${run.id}`;

  // ① 프롬프트 조립 — 실제로 모델에 뭐가 갔는지. 원문은 담지 않는다(대화 내용이므로). 구조만 남긴다.
  // 경고는 나열하지 않고 종류별로 센다 — 용사여관은 미지원 매크로 경고만 수천 개라 나열하면
  // 복사본이 그 경고로 도배되고, 정작 "몇 종류가 몇 번"이라는 답은 사라진다.
  if(diagnostics.enabled('info')&&run.prompt){
    const roles=new Map<string,number>();for(const item of run.prompt.messages)roles.set(item.role,(roles.get(item.role)??0)+1);
    diagnostics.record({...where,level:'info',kind:'provider',code:'prompt_built',key:`${key}:prompt`,summary:`프롬프트 조립 · ${kind}`,
      detail:{'메시지':`${run.prompt.messages.length}개`,'역할 구성':[...roles].map(([role,count])=>`${role} ${count}`).join(', '),'프롬프트 해시':run.promptHash??'(없음)','조립 경고':summarizeWarningCodes(run.prompt.warnings)}});
  }

  // ② 모델 응답 — 느린지, 잘렸는지("length"면 답이 중간에 끊긴 것이다), 토큰이 얼마나 들었는지.
  if(diagnostics.enabled('info'))diagnostics.record({...where,level:'info',kind:'provider',code:'model_response',key:`${key}:model`,summary:`모델 응답 · ${run.model??'(모델 미상)'} · ${ms(run.durationMs)}`,
    detail:{'프로바이더':run.provider??'(모름)','모델':run.model??'(모름)','소요':ms(run.durationMs),'토큰':`입력 ${run.inputTokens??'?'} · 출력 ${run.outputTokens??'?'}${run.tokensEstimated?' (추정)':''}`,'종료 사유':run.finishReason??'(없음)','응답 길이':`${run.responseText.length}자`}});
  if(diagnostics.enabled('warn')&&run.finishReason==='length')diagnostics.record({...where,level:'warn',kind:'provider',code:'response_truncated',key:`${key}:truncated`,summary:'응답이 토큰 상한에서 잘렸다',detail:{'종료 사유':'length','조치':'설정에서 최대 토큰을 올리거나 프롬프트를 줄인다'}});

  // ③ 엔진 사실 — 모델이 제안한 이벤트 중 무엇이 적용되고 무엇이 차단됐는가. 차단은 조용히 넘어가지 않는다.
  const needFacts=diagnostics.enabled('info')||diagnostics.enabled('warn'),facts=needFacts?run.logs.map(toFactLine):[],rejected=facts.filter(fact=>fact.rejected);
  if(diagnostics.enabled('info')&&(run.proposedEvents.length||facts.length))diagnostics.record({...where,level:'info',kind:'simulation',code:'engine_facts',key:`${key}:engine`,summary:`엔진 사실 ${facts.length-rejected.length}건 적용${rejected.length?` · ${rejected.length}건 차단`:''}`,
    detail:{'모델이 제안':run.proposedEvents.length?run.proposedEvents.map(event=>event.id).join(', '):'없음','적용':facts.filter(fact=>!fact.rejected).map(fact=>`${fact.label}${fact.delta?` ${fact.delta}`:''}${fact.after?` → ${fact.after}`:''}`).join(' · ')||'없음','상태 해시':`${run.stateBeforeHash?.slice(0,8)??'?'} → ${run.stateAfterHash?.slice(0,8)??'?'}`}});
  if(diagnostics.enabled('warn'))for(const fact of rejected)diagnostics.record({...where,level:'warn',kind:'simulation',code:'engine_event_blocked',key:`${key}:blocked:${fact.key}`,summary:`엔진이 차단: ${fact.label}`,detail:{'이유':fact.note||'(없음)','원칙':'LLM은 사실을 직접 바꾸지 못한다 — 서술만 한다'}});

  // ④ 기억 — 근거 없는 기억은 저장되지 않는다. 왜 안 남았는지가 보여야 한다.
  if(diagnostics.enabled('info')){const decisions=run.memoryDecisions??[],approved=decisions.filter(value=>value.status==='approved').length,pending=decisions.filter(value=>value.status==='candidate').length;
    if(decisions.length)diagnostics.record({...where,level:'info',kind:'card',code:'memory_decided',key:`${key}:memory`,summary:`기억 ${approved}건 확정 · ${pending}건 검토 대기 · ${decisions.length-approved-pending}건 폐기`,detail:{'결정':decisions.map(value=>`${value.status}(${value.reason})`).join(', ')}});}

  // 서사 검증 문제(엔진 사실과 어긋나는 서술 등)는 경고다.
  if(diagnostics.enabled('warn'))for(const issue of run.issues)diagnostics.record({...where,level:'warn',kind:'card',code:`narrative_${issue.code}`,key:`${key}:issue:${issue.code}`,summary:`서사 검증: ${issue.code}`,detail:{'상세':issue.detail??'(없음)'}});
}

// 새로 생긴 런만 흘려보낸다. 같은 런을 다시 그린다고 로그가 쌓이면 안 된다(수집기의 키로 막지만,
// 여기서도 세어두면 매 렌더마다 전체 런을 훑는 헛일을 하지 않는다).
export function createTurnTracer(){
  const lastBySession=new Map<string,string>();
  return(session:PlaySession|null,card:string)=>{
    if(!session)return;
    const runs=session.promptRuns,last=lastBySession.get(session.id),found=last===undefined?-1:runs.findIndex(run=>run.id===last),start=last===undefined?0:found<0?0:found+1;
    for(let index=start;index<runs.length;index+=1)try{traceRun(runs[index]!,card,session.id,session.messages.length-1);}catch{/* 진단이 플레이를 해치지 않는다 */}
    const tail=runs.at(-1);if(tail)lastBySession.set(session.id,tail.id);
  };
}
