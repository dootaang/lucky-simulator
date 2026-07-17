const dialogue=/\[\|<img=["']([^"']+)["']>\|["“]?([\s\S]*?)["”]?\|\]/g;
const status=/\[(?:상태창|사이드패널|하단상태창)\]/g;
const proposal=/\[\[(?:aff|mood)=[^\]]+\]\]/gi;

/** 원본의 실행형 HTML/CSS 대신 Lucky의 안전한 이미지 매크로와 인용문으로 바꾼다. */
export function prepareGflNarrative(source:string){
  const proposed=proposal.test(source);proposal.lastIndex=0;
  const body=source
    .replace(dialogue,(_all,asset:string,quote:string)=>`\n{{img::${asset}}}\n> ${quote.trim().replace(/^["“]|["”]$/g,'')}\n`)
    .replace(status,'')
    .replace(proposal,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
  return proposed?`${body}\n\n> AI가 제안한 호감도·기분 숫자는 적용하지 않았습니다. 관계 선택지의 엔진 판정값만 실제 상태가 됩니다.`:body;
}
