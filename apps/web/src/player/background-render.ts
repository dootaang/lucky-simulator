import {normalizeAssetName,type AssetMacroAsset} from '@simbot/risu';

const blockedTree=/<\s*(script|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>|<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;
const macro=/{{\s*(raw|path|img|image|asset|emotion|bg|audio|video|video-img)\s*::\s*([^{}]+?)\s*}}/gi;
function escape(value:string){return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
export function safeBackgroundSource(source:string,assets:readonly AssetMacroAsset[],urlFor:(asset:AssetMacroAsset)=>string|null){
  const indexed=new Map(assets.map(asset=>[normalizeAssetName(asset.name||asset.type),asset]));
  let html=source.replace(macro,(_whole,rawType:string,rawName:string)=>{const type=rawType.toLowerCase(),name=rawName.trim(),asset=indexed.get(normalizeAssetName(name)),url=asset&&urlFor(asset);if(!url)return'';const safe=escape(url),alt=escape(name);if(type==='raw'||type==='path')return safe;if(type==='audio')return`<audio controls loop src="${safe}"></audio>`;if(type==='video'||type==='video-img')return`<video autoplay muted loop playsinline src="${safe}"></video>`;if(type==='bg')return`<img class="risu-background-asset" src="${safe}" alt="${alt}">`;return`<img class="risu-inlay-image" src="${safe}" alt="${alt}">`;});
  html=html.replace(blockedTree,'').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/javascript\s*:/gi,'').replace(/@import\b[^;]*;?/gi,'').replace(/url\(\s*(['"]?)(?!data:|blob:)[^)]+\1\s*\)/gi,'none');
  return`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:;"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}.risu-background-asset{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.risu-inlay-image{max-width:100%;height:auto}audio,video{max-width:100%}</style></head><body>${html}</body></html>`;
}

