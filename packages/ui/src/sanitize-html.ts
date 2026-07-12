const allowedTags=new Set(['div','span','p','br','hr','img','b','strong','i','em','u','s','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','th','td','a']);
const dropTree=new Set(['script','style','iframe','object','embed','form','input','textarea','button','select','option','template','svg','math']);
const globalAttributes=new Set(['class','alt','title','colspan','rowspan']);

function safeUrl(value:string,kind:'image'|'link'){
  const trimmed=value.trim();
  try{
    const url=new URL(trimmed,'https://local.invalid');
    // 상대경로(스킴 없음)는 허용하지 않는다 — 모델이 <img src="에셋이름">을 쓰면 우리 오리진으로
    // 404 요청이 나가고 깨진 이미지가 뜬다. 에셋 이름은 표시 전에 URL로 해석돼야 한다.
    if(!/^[a-z][a-z0-9+.-]*:/i.test(trimmed))return'';
    if(kind==='link')return url.protocol==='https:'||url.protocol==='http:'?trimmed:'';
    return url.protocol==='blob:'||url.protocol==='https:'||url.protocol==='data:'&&/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(trimmed)?trimmed:'';
  }catch{return'';}
}

export function sanitizeHtml(source:string){
  const parsed=new DOMParser().parseFromString(source,'text/html'),output=document.implementation.createHTMLDocument('');
  const rebuild=(node:Node,parent:Node)=>{
    if(node.nodeType===Node.TEXT_NODE){parent.appendChild(output.createTextNode(node.textContent??''));return;}
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const original=node as Element,tag=original.tagName.toLowerCase();
    if(dropTree.has(tag))return;
    if(!allowedTags.has(tag)){for(const child of Array.from(original.childNodes))rebuild(child,parent);return;}
    const clean=output.createElement(tag);
    for(const attribute of Array.from(original.attributes)){
      const name=attribute.name.toLowerCase();
      if(name.startsWith('on')||name==='style')continue;
      if(globalAttributes.has(name))clean.setAttribute(name,attribute.value);
      else if(tag==='img'&&name==='src'){const value=safeUrl(attribute.value,'image');if(value)clean.setAttribute('src',value);}
      else if(tag==='a'&&name==='href'){const value=safeUrl(attribute.value,'link');if(value)clean.setAttribute('href',value);}
    }
    if(tag==='a'){clean.setAttribute('target','_blank');clean.setAttribute('rel','noreferrer noopener');}
    parent.appendChild(clean);
    for(const child of Array.from(original.childNodes))rebuild(child,clean);
  };
  for(const child of Array.from(parsed.body.childNodes))rebuild(child,output.body);
  return output.body.innerHTML;
}
