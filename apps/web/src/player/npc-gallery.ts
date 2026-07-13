import type{CardAsset}from'@simbot/card';

export interface NpcSprite{asset:CardAsset;emotion:string;variant:number|null;command:string}
export interface NpcCluster{charId:string;sprites:NpcSprite[];emotions:string[]}

const image=(asset:CardAsset)=>asset.mime.startsWith('image/')||['png','jpg','jpeg','webp','gif','avif','bmp','svg'].includes(asset.ext.toLowerCase());
const stem=(asset:Pick<CardAsset,'name'|'ext'>)=>{let value=String(asset.name||'').normalize('NFKC').trim(),ext=String(asset.ext||'');if(ext&&value.toLowerCase().endsWith(`.${ext.toLowerCase()}`))value=value.slice(0,-ext.length-1);return value;};
const key=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
const defaultOwner=(value:string)=>value.match(/^(.+?)_default(?:_\d+)?$/i)?.[1]??value.match(/^(.+?)\s+default$/i)?.[1]??null;

export function parseSpriteName(asset:Pick<CardAsset,'name'|'ext'>,owners:readonly string[]=[]){
  const value=stem(asset),owner=[...owners].sort((a,b)=>b.length-a.length).find(candidate=>value===candidate||value.startsWith(`${candidate}_`)||value.startsWith(`${candidate} `));
  if(owner){let rest=value.slice(owner.length).replace(/^[_\s]+/,'');const variantMatch=/_([0-9]+)$/.exec(rest),variant=variantMatch?Number(variantMatch[1]):null;if(variantMatch)rest=rest.slice(0,variantMatch.index);return{charId:owner,emotion:rest||'default',variant,command:variantMatch?value.slice(0,value.length-variantMatch[0].length):value};}
  const parts=value.split('_').filter(Boolean),last=parts.at(-1),variant=last&&/^\d+$/.test(last)?Number(parts.pop()):null;if(parts.length>=2){const charId=parts.shift()!;return{charId,emotion:parts.join('_')||'default',variant,command:variant===null?value:value.replace(/_\d+$/,'')};}
  return{charId:'기타',emotion:value||'default',variant:null,command:value};
}

export function buildNpcClusters(assets:readonly CardAsset[]):NpcCluster[]{
  const seen=new Set<string>(),pictures=assets.filter(image).filter(asset=>{const value=key(stem(asset));if(seen.has(value))return false;seen.add(value);return true;}),owners=[...new Set(pictures.map(asset=>defaultOwner(stem(asset))).filter((value):value is string=>!!value))],groups=new Map<string,NpcSprite[]>();
  for(const asset of pictures){const parsed=parseSpriteName(asset,owners);if(parsed.charId==='기타')continue;const sprites=groups.get(parsed.charId)??[];sprites.push({asset,emotion:parsed.emotion,variant:parsed.variant,command:parsed.command});groups.set(parsed.charId,sprites);}
  return[...groups].map(([charId,sprites])=>({charId,sprites,emotions:[...new Set(sprites.map(sprite=>sprite.emotion))].sort((a,b)=>emotionRank(a)-emotionRank(b)||a.localeCompare(b))})).sort((a,b)=>a.charId.localeCompare(b.charId));
}

export function selectNpcSprite(group:NpcCluster,emotion:string){const wanted=key(emotion),choices=group.sprites.filter(sprite=>key(sprite.emotion)===wanted);return choices[stableIndex(`${group.charId}:${emotion}`,choices.length)]??group.sprites.find(sprite=>key(sprite.emotion)==='default')??group.sprites[0]??null;}
export function findNpcSprite(groups:readonly NpcCluster[],npcId:string,emotion='default'){const wanted=key(npcId),group=groups.find(value=>key(value.charId)===wanted);return group?selectNpcSprite(group,emotion):null;}

export function extractAssetSpeakers(text:string,groups:readonly NpcCluster[]){
  const commands=[...String(text??'').matchAll(/<img(?:\s+src)?\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]!.trim()),result:Array<{npcId:string;emotion?:string;focus?:boolean}>=[];
  for(const command of commands){const wanted=key(command);let found:{group:NpcCluster;sprite:NpcSprite}|null=null;for(const group of groups)for(const sprite of group.sprites)if(key(sprite.command)===wanted||key(stem(sprite.asset))===wanted){found={group,sprite};break;}if(!found)continue;const existing=result.find(value=>key(value.npcId)===key(found!.group.charId));if(existing){existing.emotion=found.sprite.emotion;continue;}result.push({npcId:found.group.charId,emotion:found.sprite.emotion});if(result.length===3)break;}
  if(result.length)result[result.length-1]!.focus=true;return result;
}

function emotionRank(value:string){const index=['default','neutral','normal','smile'].indexOf(value.toLowerCase());return index<0?4:index;}
function stableIndex(value:string,length:number){if(!length)return 0;let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0)%length;}
