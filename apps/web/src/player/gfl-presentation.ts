const systemProposal=/\[\[(?:aff|mood|hp|mp|gold|res|diss|stat|event|log\s*\d*|prog|loot|보스격파|전투완료|목표달성|작전완료|임무완료|진행|단계완료)[^\]]*\]\]/gi;
const uiToken=/\[(?:상태창|사이드패널|하단상태창|진행도상태|시작버튼|인트로|대화|임포트대기)\]/g;
const background=/\[배경\s*:\s*([^\]]+)\]/gi;
const time=/\|\s*day\s*\d+\s*_\s*[가-힣]+/gi;

function dialogue(asset:string,quote:string){
  // 원본의 간결한 <img="이름"> 문법을 유지한다. 표시 파이프라인은 이 형식을 실제 이미지로
  // 바꾸고, 외부 에셋 모듈을 읽는 잠깐 동안에도 {{img::…}} 같은 내부 매크로를 사용자에게 노출하지 않는다.
  return `\n<img="${asset.trim()}">\n> ${quote.trim().replace(/^["“]|["”]$/g,'')}\n`;
}

/** 원본 Risu UI 명령을 실행하지 않고 Lucky의 안전한 이미지·인용문으로 투영한다. */
export function prepareGflNarrative(source:string){
  return String(source??'')
    .replace(/\[전투\|(?:<|&lt;)?img=["“”]?([^"“”>]+)["“”]?(?:>|&gt;)?\|["“”]?([^|\]]+?)["“”]?\|HP=\d+>\d+\|MP=\d+>\d+\|\]/gi,(_all,asset,quote)=>dialogue(asset,quote))
    .replace(/\[(?:엑스|적대)\|(?:<|&lt;)?img=["“”]?([^"“”>]+)["“”]?(?:>|&gt;)?\|["“”]?([^|\]]+?)["“”]?\|\]/gi,(_all,asset,quote)=>dialogue(asset,quote))
    .replace(/\[\|(?:<|&lt;)?img=["“”]?([^"“”>]+)["“”]?(?:>|&gt;)?\|["“”]?([^|\]]+?)["“”]?\|\]/gi,(_all,asset,quote)=>dialogue(asset,quote))
    .replace(/\[USER\|([^|\]]+?)\|\]/gi,(_all,quote)=>`\n> ${String(quote).trim()}\n`)
    .replace(/\[UI_IMG\][\s\S]*?\[UI_IMG\]/gi,'')
    .replace(/\[제조완료:[^\]]*\]/gi,'')
    .replace(/\[(?:이벤트\s*:\s*[^\]]+|퇴각 확인)\]/gi,'')
    .replace(/\[세이브\][\s\S]*?\[\/세이브\]/gi,'')
    .replace(/\[\[kalina_shop=(?:1|0)\]\]/gi,'')
    .replace(systemProposal,'')
    .replace(background,'')
    .replace(time,'')
    .replace(uiToken,'')
    .replace(/\(AI지침:[^)]*\)/gi,'')
    .replace(/^\s*(?:==@|\/{3}|\|)\s*$/gm,'')
    .replace(/[ \t]+$/gm,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

export function extractGflBackgroundCue(content:string):string|null{
  let cue:string|null=null;
  for(const match of String(content??'').matchAll(background))cue=match[1]?.trim()??cue;
  background.lastIndex=0;
  return cue;
}

export function latestGflBackgroundCue(messages:readonly{role?:string;content?:string}[]):string|null{
  for(let index=messages.length-1;index>=0;index-=1){
    const message=messages[index];
    if(message?.role!=='assistant')continue;
    const cue=extractGflBackgroundCue(message.content??'');
    if(cue)return cue;
  }
  return null;
}
