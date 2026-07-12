export interface AssetMacroAsset{name:string;type:string;mime:string;bytes:Uint8Array|null}
export interface AssetMacroWarning{code:'asset_missing'|'unsupported_asset_macro';macro:string;name:string}
export interface AssetMacroResult{content:string;warnings:AssetMacroWarning[]}

const supported=new Set(['raw','img','image','asset','emotion']);
const known=new Set(['raw','path','img','image','video','audio','bgm','bg','emotion','asset','video-img']);
const pattern=/{{\s*([a-z-]+)\s*::\s*([^{}]+?)\s*}}/gims;

export function normalizeAssetName(value:string){return value.normalize('NFKC').toLowerCase().replace(/[\s./\\]+/g,'-');}

function dataUrl(asset:AssetMacroAsset){
  if(!asset.bytes)return null;
  let binary='';
  for(let index=0;index<asset.bytes.length;index+=0x2000)binary+=String.fromCharCode(...asset.bytes.subarray(index,index+0x2000));
  return `data:${asset.mime||'application/octet-stream'};base64,${btoa(binary)}`;
}

// 모델은 카드의 <img src="{{raw::name}}"> 를 흉내 내면서 매크로를 빼고 <img src="name"> 만 쓰는 일이 잦다.
// 그대로 두면 브라우저가 상대경로로 로드를 시도해 404 → 깨진 이미지 아이콘이 뜬다(오너 실플레이 발견).
// 그래서 스킴 없는 src(= 에셋 이름)도 카드 에셋으로 해석하고, 못 찾으면 img를 지운다(깨진 아이콘 방지).
const bareImg=/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gis;
const hasScheme=(value:string)=>/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value.trim());

export function resolveBareAssetSources(content:string,assets:readonly AssetMacroAsset[]):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const indexed=new Map(assets.map(asset=>[normalizeAssetName(asset.name||asset.type),asset]));
  const resolved=content.replace(bareImg,(original:string,_quote:string,rawSrc:string)=>{
    const name=rawSrc.trim();
    if(!name||hasScheme(name))return original; // 이미 URL(우리가 치환한 data:/blob:/https:)이면 그대로
    const asset=indexed.get(normalizeAssetName(name)),url=asset&&dataUrl(asset);
    if(!asset||!url){warnings.push({code:'asset_missing',macro:'img',name});return'';} // 깨진 아이콘 대신 제거
    return original.replace(rawSrc,url);
  });
  return{content:resolved,warnings};
}

export function resolveAssetMacros(content:string,assets:readonly AssetMacroAsset[]):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const indexed=new Map(assets.map(asset=>[normalizeAssetName(asset.name||asset.type),asset]));
  const resolved=content.replace(pattern,(original:string,rawMacro:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    const asset=indexed.get(normalizeAssetName(name)),url=asset&&dataUrl(asset);
    if(!asset||!url){warnings.push({code:'asset_missing',macro,name});return original;}
    if(macro==='raw')return url;
    if(macro==='image')return `<div class="risu-inlay-image"><img src="${url}" alt="${name}"></div>`;
    return `<img src="${url}" alt="${name}">`;
  });
  // 매크로 치환 뒤, 모델이 매크로 없이 쓴 <img src="이름">도 이어서 해석한다.
  const bare=resolveBareAssetSources(resolved,assets);
  return{content:bare.content,warnings:[...warnings,...bare.warnings]};
}

export function compactAssetMacrosForPrompt(content:string,assets:readonly AssetMacroAsset[]=[]):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const names=new Set(assets.map(asset=>normalizeAssetName(asset.name||asset.type)));
  const resolved=content.replace(pattern,(original:string,rawMacro:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro))return original;
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(assets.length&&!names.has(normalizeAssetName(name))){warnings.push({code:'asset_missing',macro,name});return original;}
    return name;
  });
  return{content:resolved,warnings};
}
