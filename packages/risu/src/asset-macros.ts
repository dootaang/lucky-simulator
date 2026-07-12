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
const bareImg=/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gis;
function legacyBare(content:string,assets:readonly AssetMacroAsset[]):AssetMacroResult{const warnings:AssetMacroWarning[]=[],indexed=new Map(assets.map(asset=>[normalizeAssetName(asset.name||asset.type),asset]));return{content:content.replace(bareImg,(original:string,_quote:string,source:string)=>{const name=source.trim();if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(name))return original;const asset=indexed.get(normalizeAssetName(name)),url=asset&&dataUrl(asset);if(!url){warnings.push({code:'asset_missing',macro:'img',name});return'';}return original.replace(source,url);}),warnings};}

export function resolveAssetMacros(content:string,assets:readonly AssetMacroAsset[],options:{bare?:boolean}={bare:true}):AssetMacroResult{
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
  if(options.bare!==false){const bare=legacyBare(resolved,assets);return{content:bare.content,warnings:[...warnings,...bare.warnings]};}
  return{content:resolved,warnings};
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
