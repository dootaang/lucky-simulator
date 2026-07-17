import type{CardAsset}from'@simbot/card';
import{resolveNamedAsset}from'@simbot/risu';

export interface NpcSprite{asset:CardAsset;emotion:string;variant:number|null;command:string}
export interface NpcCluster{charId:string;sprites:NpcSprite[];emotions:string[]}

const image=(asset:CardAsset)=>asset.mime.startsWith('image/')||['png','jpg','jpeg','webp','gif','avif','bmp','svg'].includes(asset.ext.toLowerCase());
const stem=(asset:Pick<CardAsset,'name'|'ext'>)=>{let value=String(asset.name||'').normalize('NFKC').trim(),ext=String(asset.ext||'');if(ext&&value.toLowerCase().endsWith(`.${ext.toLowerCase()}`))value=value.slice(0,-ext.length-1);return value;};
const key=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
const defaultOwner=(value:string)=>value.match(/^(.+?)_default(?:_\d+)?$/i)?.[1]??value.match(/^(.+?)\s+default$/i)?.[1]??null;
const hasSortedPrefix=(values:readonly string[],prefix:string)=>{let low=0,high=values.length;while(low<high){const middle=(low+high)>>>1,current=values[middle]??'';if(current<prefix)low=middle+1;else high=middle;}return values[low]?.startsWith(prefix)??false;};

function parseSpriteNameFromOwners(asset:Pick<CardAsset,'name'|'ext'>,owners:readonly string[]){
  const value=stem(asset),owner=owners.find(candidate=>value===candidate||value.startsWith(`${candidate}_`)||value.startsWith(`${candidate} `));
  if(owner){let rest=value.slice(owner.length).replace(/^[_\s]+/,'');const variantMatch=/_([0-9]+)$/.exec(rest),variant=variantMatch?Number(variantMatch[1]):null;if(variantMatch)rest=rest.slice(0,variantMatch.index);return{charId:owner,emotion:rest||'default',variant,command:variantMatch?value.slice(0,value.length-variantMatch[0].length):value};}
  const parts=value.split('_').filter(Boolean),last=parts.at(-1),variant=last&&/^\d+$/.test(last)?Number(parts.pop()):null;if(parts.length>=2){const charId=parts.shift()!;return{charId,emotion:parts.join('_')||'default',variant,command:variant===null?value:value.replace(/_\d+$/,'')};}
  return{charId:'기타',emotion:value||'default',variant:null,command:value};
}

export function parseSpriteName(asset:Pick<CardAsset,'name'|'ext'>,owners:readonly string[]=[]){
  return parseSpriteNameFromOwners(asset,[...owners].sort((a,b)=>b.length-a.length));
}

export function buildNpcClusters(assets:readonly CardAsset[]):NpcCluster[]{
  const seen=new Set<string>(),pictures=assets.filter(image).filter(asset=>{const value=key(stem(asset));if(seen.has(value))return false;seen.add(value);return true;}),stems=pictures.map(stem),sortedStems=[...new Set(stems)].sort(),bareOwners=sortedStems.filter(value=>hasSortedPrefix(sortedStems,`${value}_`)||hasSortedPrefix(sortedStems,`${value} `)||hasSortedPrefix(sortedStems,`${value}.`)),owners=[...new Set([...pictures.map(asset=>defaultOwner(stem(asset))).filter((value):value is string=>!!value),...bareOwners])].sort((a,b)=>b.length-a.length),groups=new Map<string,NpcSprite[]>();
  for(const asset of pictures){const parsed=parseSpriteNameFromOwners(asset,owners);if(parsed.charId==='기타')continue;const sprites=groups.get(parsed.charId)??[];sprites.push({asset,emotion:parsed.emotion,variant:parsed.variant,command:parsed.command});groups.set(parsed.charId,sprites);}
  return[...groups].map(([charId,sprites])=>({charId,sprites,emotions:[...new Set(sprites.map(sprite=>sprite.emotion))].sort((a,b)=>emotionRank(a)-emotionRank(b)||a.localeCompare(b))})).sort((a,b)=>a.charId.localeCompare(b.charId));
}

export function selectNpcSprite(group:NpcCluster,emotion:string,outfit?:number){const wanted=key(emotion);let choices=group.sprites.filter(sprite=>key(sprite.emotion)===wanted);if(!choices.length){const aliases:Record<string,string[]>={happy:['joy','smile'],damaged:['defeat','exhausted','sad'],pouting:['angry','sulky','unhappy'],flustered:['embarrassed','surprised'],natural:['default','neutral'],thinking:['serious','question']};for(const alias of aliases[wanted]??[]){choices=group.sprites.filter(sprite=>key(sprite.emotion)===alias);if(choices.length)break;}}if(!choices.length&&wanted!=='default')return selectNpcSprite(group,'default',outfit);if(!choices.length){for(const fallback of['natural','neutral','normal','smile','serious']){choices=group.sprites.filter(sprite=>key(sprite.emotion)===fallback);if(choices.length)break;}}const command=choices[0]?.command,asset=command?resolveNamedAsset(command,choices.map(value=>value.asset),outfit===undefined?{}:{outfits:{[group.charId]:outfit}}):null;return choices.find(value=>value.asset===asset)??choices[0]??null;}
export function findNpcSprite(groups:readonly NpcCluster[],npcId:string,emotion='default',outfit?:number){const wanted=key(npcId),group=groups.find(value=>key(value.charId)===wanted);return group?selectNpcSprite(group,emotion,outfit):null;}

export function extractAssetSpeakers(text:string,groups:readonly NpcCluster[]){
  const commands=[...String(text??'').matchAll(/<img(?:\s+src)?\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]!.trim()),result:Array<{npcId:string;emotion?:string;focus?:boolean}>=[];
  for(const command of commands){const wanted=key(command);let found:{group:NpcCluster;sprite:NpcSprite}|null=null;for(const group of groups)for(const sprite of group.sprites)if(key(sprite.command)===wanted||key(stem(sprite.asset))===wanted){found={group,sprite};break;}if(!found)continue;const existing=result.find(value=>key(value.npcId)===key(found!.group.charId));if(existing){existing.emotion=found.sprite.emotion;continue;}result.push({npcId:found.group.charId,emotion:found.sprite.emotion});if(result.length===3)break;}
  // GFL 응답은 이미지 명령 없이 `M4A1: 대사` 형식만 쓰기도 한다. 줄 첫머리의 실제 에셋 소유자만
  // 화자로 인정해, 일반 서술에 이름이 한 번 언급된 경우까지 초상으로 오인하지 않는다.
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),dialogue=String(text??''),named=groups.map(group=>({group,index:dialogue.search(new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?${escape(group.charId)}(?:\\*\\*)?\\s*[:：]`,'i'))})).filter(value=>value.index>=0).sort((a,b)=>a.index-b.index);
  for(const{group}of named){if(result.some(value=>key(value.npcId)===key(group.charId)))continue;result.push({npcId:group.charId,emotion:'default'});if(result.length===3)break;}
  if(result.length)result[result.length-1]!.focus=true;return result;
}

/**
 * 모델이 GFL 이미지 명령을 빠뜨린 경우의 보수적 복구다. 따옴표 대사가 있고, 에셋 카탈로그에 있는
 * 인형이 장면 전체에서 정확히 한 명만 언급될 때만 화자로 인정한다. 여러 인형이 나오거나 단순 서술뿐인
 * 장면은 추측하지 않는다.
 */
export function inferGflProseSpeakers(text:string,groups:readonly NpcCluster[]){
  const source=String(text??'');
  if(!/(?:"[^"\n]{2,}"|“[^”\n]{2,}”|「[^」\n]{2,}」)/.test(source))return[];
  const mentioned=groups.filter(group=>{
    const name=group.charId.trim();
    if(key(name).length<2)return false;
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),ascii=/^[a-z0-9 _.-]+$/i.test(name);
    return new RegExp(ascii?`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`:escaped,'i').test(source);
  });
  if(mentioned.length!==1)return[];
  const emotion=/미소|웃(?:었|으며|는다|었다|음)|표정.{0,12}부드|안도/.test(source)?'smile':/놀라|당황|화들짝/.test(source)?'surprised':/분노|화가|노려|격앙/.test(source)?'angry':/상처|그을|피로|고단|손상|부상|슬픈|눈물/.test(source)?'damaged':'default';
  return[{npcId:mentioned[0]!.charId,emotion,focus:true}];
}

function emotionRank(value:string){const index=['default','neutral','normal','smile'].indexOf(value.toLowerCase());return index<0?4:index;}
