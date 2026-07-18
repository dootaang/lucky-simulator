export interface AssetMacroAsset{name:string;type:string;mime:string;bytes:Uint8Array|null;url?:string;moduleNamespace?:string}
export interface AssetMacroWarning{code:'asset_missing'|'unsupported_asset_macro';macro:string;name:string}
export interface AssetMacroResult{content:string;warnings:AssetMacroWarning[]}
export interface AssetResolveOptions{outfits?:Readonly<Record<string,number|undefined>>;variantFor?:(reference:string,candidates:readonly AssetVariant[])=>number|null|undefined;
// Risu의 채팅 표시 경로는 찾지 못한 에셋 매크로를 글자로 노출하지 않는다. 기본값은 기존 진단·도구 계약을
// 위해 보존하며, 최종 화면 렌더러만 false를 넘겨 빈 문자열로 처리한다.
preserveMissing?:boolean;
// 표시 경로가 blob: 객체 URL을 공급하는 자리. 없으면 base64 data URI로 폴백하는데, 대형 카드에서는
// 그 팽창(실측: DOMINIUM 인사말 17,551자 → 7,984,138자)이 CBS input 예산을 터뜨려 렌더 전체가 원문으로
// 주저앉는다. 예산을 올리는 게 아니라 팽창을 없애는 것이 맞다 — 업스트림 Risu도 짧은 URL을 쓴다.
urlFor?:(asset:AssetMacroAsset)=>string|null|undefined}
export interface AssetVariant{asset:AssetMacroAsset;variant:number|null;base:string}

const supported=new Set(['raw','img','image','asset','emotion']);
const known=new Set(['raw','path','img','image','video','audio','bgm','bg','emotion','asset','video-img']);
const pattern=/{{\s*([a-z-]+)\s*(?:::|=)\s*(["'″]?)([^{}]+?)\2\s*}}/gims;

export function normalizeAssetName(value:string){return value.normalize('NFKC').toLowerCase().replace(/[\s./\\]+/g,'-');}

function dataUrl(asset:AssetMacroAsset){
  if(asset.url)return asset.url;
  if(!asset.bytes)return null;
  let binary='';
  for(let index=0;index<asset.bytes.length;index+=0x2000)binary+=String.fromCharCode(...asset.bytes.subarray(index,index+0x2000));
  return `data:${asset.mime||'application/octet-stream'};base64,${btoa(binary)}`;
}
const bareImg=/<(?:img|image)\b[^>]*\bsrc\s*=\s*(?:(["'″])([\s\S]*?)\1|([^\s>]+))[^>]*>/gis;
const equalImg=/<(?:img|image|emotion|asset|raw|bg)\s*=\s*(?:(["'″])([\s\S]*?)\1|([^\s>]+))\s*>/gis;
const pipeAsset=/\[([^\]\n|]*)\|\s*([^\]\n]+?)\s*]/g;
function aliases(value:string){const raw=value.trim(),withoutQuery=raw.replace(/[?#].*$/,''),withoutExtension=withoutQuery.replace(/\.[a-z0-9]{2,5}$/i,'');
// 카드 정규식이 {{getvar::npc_*_outfit}}으로 변형 번호를 붙이는데 그 변수는 카드 Lua가 채운다(M-D 전까지 빈 값).
// 그러면 이름이 'silvia_default_'처럼 꼬리 _로 끝난다 — 변형 그룹 이름으로 정규화해 기본 변형이라도 보이게 한다(ADR 0004 경과 조치).
const withoutTrailing=withoutExtension.replace(/[_\s]+$/,'');
return[raw,withoutQuery,withoutExtension,withoutTrailing].map(normalizeAssetName);}
function assetIndex(assets:readonly AssetMacroAsset[]){const indexed=new Map<string,AssetMacroAsset>();for(const asset of assets){for(const name of aliases(asset.name||asset.type))if(name&&!indexed.has(name))indexed.set(name,asset);if(asset.moduleNamespace)for(const name of aliases(`${asset.moduleNamespace}/${asset.name||asset.type}`))if(name&&!indexed.has(name))indexed.set(name,asset);}return indexed;}
function stableIndex(value:string,length:number){if(!length)return 0;let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0)%length;}
// 변형 번호는 구분자('_'·'-') 유무와 무관하게 꼬리 숫자로 판정한다. 실카드가 'bg1'·'Dive bar7'처럼
// 구분자 없이 번호를 붙인다(DOMINIUM 실측). base는 숫자·구분자가 아닌 글자로 끝나야 한다 — '40' 같은
// 숫자 전용 이름을 억지로 그룹에 넣지 않는다. 확장자는 aliases와 같은 규칙으로 벗긴다('Dive bar0.png').
const trailingVariant=/^(.*?[^\d_-])[_-]?(\d+)$/;
function variantOf(asset:AssetMacroAsset):AssetVariant{const name=aliases(asset.name||asset.type).at(-1)??normalizeAssetName(asset.name||asset.type),match=trailingVariant.exec(name);return{asset,variant:match?Number(match[2]):null,base:match?.[1]??name};}
// 요청 이름 자체가 '그룹+번호'인데 그 번호가 카드에 없을 때(제작자 오프바이원 — 'Dive bar8', 실물은 0~7)
// 같은 그룹의 다른 변형으로 폴백한다. 요청 번호가 실재하면 그 번호가 우선한다.
function variantCandidates(wanted:string,assets:readonly AssetMacroAsset[]){const groups=assets.map(variantOf).filter(value=>value.variant!==null);let base=wanted,requested:number|null=null,variants=groups.filter(value=>value.base===wanted);if(!variants.length){const parsed=trailingVariant.exec(wanted);if(parsed){base=parsed[1]!;requested=Number(parsed[2]);variants=groups.filter(value=>value.base===base);}}return{base,requested,variants};}
export function resolveNamedAsset(reference:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions={}):AssetMacroAsset|null{const wantedAliases=aliases(reference),index=assetIndex(assets),exact=wantedAliases.map(name=>index.get(name)).find(Boolean);if(exact)return exact;const wanted=wantedAliases.at(-1)??normalizeAssetName(reference),{requested,variants}=variantCandidates(wanted,assets);if(!variants.length)return null;if(requested!==null){const selected=variants.find(value=>value.variant===requested);if(selected)return selected.asset;}const owners=Object.entries(options.outfits??{}).filter((entry):entry is[string,number]=>Number.isInteger(entry[1])).sort((a,b)=>normalizeAssetName(b[0]).length-normalizeAssetName(a[0]).length),owner=owners.find(([id])=>{const key=normalizeAssetName(id);return wanted===key||wanted.startsWith(`${key}_`)||wanted.startsWith(`${key}-`);}),declared=options.variantFor?.(reference,variants),variant=owner?.[1]??(Number.isInteger(declared)?declared:null);if(variant!==null){const selected=variants.find(value=>value.variant===variant);if(selected)return selected.asset;}return(variants.find(value=>value.variant===0)??variants[stableIndex(wanted,variants.length)])!.asset;}
function assetImage(name:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions,macro='img'){const asset=resolveNamedAsset(name,assets,options),url=asset&&(options.urlFor?.(asset)??dataUrl(asset));return{asset,url,warning:!url?{code:'asset_missing' as const,macro,name:asset?.name??name}:null};}
function legacyBare(content:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions):AssetMacroResult{const warnings:AssetMacroWarning[]=[];let output=content.replace(bareImg,(original:string,_quote:string,quoted:string,plain:string)=>{const name=(quoted??plain??'').trim();if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|\?)/i.test(name))return original;const hit=assetImage(name,assets,options);if(!hit.url){warnings.push(hit.warning!);return'';}return original.replace(quoted??plain,hit.url);});output=output.replace(equalImg,(original:string,_quote:string,quoted:string,plain:string)=>{const name=(quoted??plain??'').trim(),hit=assetImage(name,assets,options);if(!hit.url){warnings.push(hit.warning!);return'';}return `<img src="${hit.url}" alt="${name}">`;});output=output.replace(pipeAsset,(original:string,_prefix:string,name:string)=>{const hit=assetImage(name.trim(),assets,options);if(!hit.url)return original;return `<img src="${hit.url}" alt="${name.trim()}">`;});return{content:output,warnings};}

export function resolveAssetMacros(content:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions&{bare?:boolean}={bare:true}):AssetMacroResult{
  const warnings:AssetMacroWarning[]=[];
  const resolved=content.replace(pattern,(original:string,rawMacro:string,_quote:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    const asset=resolveNamedAsset(name,assets,options),url=asset&&(options.urlFor?.(asset)??dataUrl(asset));
    if(!asset||!url){warnings.push({code:'asset_missing',macro,name:asset?.name??name});return options.preserveMissing===false?'':original;}
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
  const resolved=content.replace(pattern,(original:string,rawMacro:string,_quote:string,rawName:string)=>{
    const macro=rawMacro.toLowerCase(),name=rawName.trim();
    if(!known.has(macro))return original;
    if(!supported.has(macro)){warnings.push({code:'unsupported_asset_macro',macro,name});return original;}
    if(assets.length&&!names.has(normalizeAssetName(name))&&!resolveNamedAsset(name,assets)){warnings.push({code:'asset_missing',macro,name});return original;}
    return name;
  });
  return{content:resolved,warnings};
}
export function stripPromptImageMarkup(content:string):string{let text=String(content??'').replace(/<img\b[^>]*>/gi,'');for(let pass=0;pass<4;pass++)text=text.replace(/<(div|span|figure)\b[^>]*>\s*<\/\1>/gi,'');return text.replace(/\n{3,}/g,'\n\n').trim();}

// 진단 전용 — 에셋 이름 해석이 실패했을 때 "무엇을 시도했는가"를 사람이 읽을 수 있게 되짚는다.
// 렌더 경로에서는 부르지 않는다(실패 시에만). 이게 없으면 사용자는 "이미지가 안 떠요"까지만 말할 수 있고,
// 그 다음은 매번 카드를 뜯어봐야 한다.
export interface AssetLookupExplanation{reference:string;tried:string[];variantGroup:string;variantsAvailable:number[];resolved:string|null;outfitOwner:string|null;outfit:number|null}
export function explainAssetLookup(reference:string,assets:readonly AssetMacroAsset[],options:AssetResolveOptions={}):AssetLookupExplanation{
  const tried=[...new Set(aliases(reference).filter(Boolean))],wanted=tried.at(-1)??normalizeAssetName(reference);
  const{base,variants}=variantCandidates(wanted,assets);
  const owner=Object.entries(options.outfits??{}).filter((entry):entry is[string,number]=>Number.isInteger(entry[1])).sort((a,b)=>normalizeAssetName(b[0]).length-normalizeAssetName(a[0]).length).find(([id])=>{const key=normalizeAssetName(id);return wanted===key||wanted.startsWith(`${key}_`)||wanted.startsWith(`${key}-`);});
  const resolved=resolveNamedAsset(reference,assets,options);
  return{reference,tried,variantGroup:base,variantsAvailable:variants.map(value=>value.variant!).sort((a,b)=>a-b),resolved:resolved?.name??null,outfitOwner:owner?.[0]??null,outfit:owner?.[1]??null};
}
