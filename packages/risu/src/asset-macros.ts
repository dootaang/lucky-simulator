export interface AssetMacroAsset{name:string;type:string;mime:string;bytes:Uint8Array|null;url?:string;moduleNamespace?:string}
export interface AssetMacroWarning{code:'asset_missing'|'unsupported_asset_macro';macro:string;name:string}
export interface AssetMacroResult{content:string;warnings:AssetMacroWarning[]}
export interface AssetResolveOptions{outfits?:Readonly<Record<string,number|undefined>>;variantFor?:(reference:string,candidates:readonly AssetVariant[])=>number|null|undefined}
export interface AssetVariant{asset:AssetMacroAsset;variant:number|null;base:string}

const supported=new Set(['raw','img','image','asset','emotion']);
const known=new Set(['raw','path','img','image','video','audio','bgm','bg','emotion','asset','video-img']);
const pattern=/{{\s*([a-z-]+)\s*::\s*([^{}]+?)\s*}}/gims;

export function normalizeAssetName(value:string){return value.normalize('NFKC').toLowerCase().replace(/[\s./\\]+/g,'-');}

function dataUrl(asset:AssetMacroAsset){
  if(asset.url)return asset.url;
  if(!asset.bytes)return null;
  let binary='';
  for(let index=0;index<asset.bytes.length;index+=0x2000)binary+=String.fromCharCode(...asset.bytes.subarray(index,index+0x2000));
  return `data:${asset.mime||'application/octet-stream'};base64,${btoa(binary)}`;
}
const bareImg=/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gis;
function assetIndex(assets:readonly AssetMacroAsset[]){const indexed=new Map<string,AssetMacroAsset>();for(const asset of assets){const name=normalizeAssetName(asset.name||asset.type);if(!indexed.has(name))indexed.set(name,asset);if(asset.moduleNamespace){const scoped=normalizeAssetName(`${asset.moduleNamespace}/${asset.name||asset.type}`);if(!indexed.has(scoped))indexed.set(scoped,asset);}}return indexed;}
function stableIndex(value:string,length:number){if(!length)return 0;let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0)%length;}
function variantOf(asset:AssetMacroAsset):AssetVariant{const name=normalizeAssetName(asset.name||asset.type),match=/^(.*?)[_-](\d+)$/.exec(name);return{asset,variant:match?Number(match[2]):null,base:match?.[1]??name};}
export function resolveNamedAsset(reference:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions={}):AssetMacroAsset|null{const wanted=normalizeAssetName(reference),exact=assetIndex(assets).get(wanted);if(exact)return exact;const variants=assets.map(variantOf).filter(value=>value.variant!==null&&value.base===wanted);if(!variants.length)return null;const owners=Object.entries(options.outfits??{}).filter((entry):entry is[string,number]=>Number.isInteger(entry[1])).sort((a,b)=>normalizeAssetName(b[0]).length-normalizeAssetName(a[0]).length),owner=owners.find(([id])=>{const key=normalizeAssetName(id);return wanted===key||wanted.startsWith(`${key}_`)||wanted.startsWith(`${key}-`);}),declared=options.variantFor?.(reference,variants),variant=owner?.[1]??(Number.isInteger(declared)?declared:null);if(variant!==null){const selected=variants.find(value=>value.variant===variant);if(selected)return selected.asset;}return(variants.find(value=>value.variant===0)??variants[stableIndex(wanted,variants.length)])!.asset;}
function legacyBare(content:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions):AssetMacroResult{const warnings:AssetMacroWarning[]=[];return{content:content.replace(bareImg,(original:string,_quote:string,source:string)=>{const name=source.trim();if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(name))return original;const asset=resolveNamedAsset(name,assets,options),url=asset&&dataUrl(asset);if(!url){warnings.push({code:'asset_missing',macro:'img',name:asset?.name??name});return'';}return original.replace(source,url);}),warnings};}

export function resolveAssetMacros(content:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions&{bare?:boolean}={bare:true}):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const resolved=content.replace(pattern,(original:string,rawMacro:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    const asset=resolveNamedAsset(name,assets,options),url=asset&&dataUrl(asset);
    if(!asset||!url){warnings.push({code:'asset_missing',macro,name:asset?.name??name});return original;}
    if(macro==='raw')return url;
    if(macro==='image')return `<div class="risu-inlay-image"><img src="${url}" alt="${name}"></div>`;
    return `<img src="${url}" alt="${name}">`;
  });
  if(options.bare!==false){const bare=legacyBare(resolved,assets,options);return{content:bare.content,warnings:[...warnings,...bare.warnings]};}
  return{content:resolved,warnings};
}

export function compactAssetMacrosForPrompt(content:string,assets:readonly AssetMacroAsset[]=[]):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const names=new Set(assets.map(asset=>normalizeAssetName(asset.name||asset.type)));
  const resolved=content.replace(pattern,(original:string,rawMacro:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro))return original;
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(assets.length&&!names.has(normalizeAssetName(name))&&!resolveNamedAsset(name,assets)){warnings.push({code:'asset_missing',macro,name});return original;}
    return name;
  });
  return{content:resolved,warnings};
}
export function stripPromptImageMarkup(content:string):string{let text=String(content??'').replace(/<img\b[^>]*>/gi,'');for(let pass=0;pass<4;pass++)text=text.replace(/<(div|span|figure)\b[^>]*>\s*<\/\1>/gi,'');return text.replace(/\n{3,}/g,'\n\n').trim();}
