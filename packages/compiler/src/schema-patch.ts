import type { MinedCard } from './lua-mine.ts';

export interface SchemaPatch { path:string; from:unknown; to:unknown; source:string; }
export interface UnmatchedMinedValue { path:string; value:unknown; source:string; reason:string; }

const RANKS=['F','E','D','C','B','A','S','SS','SSS','EX'];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&!('__ref' in value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const numericArray=(value:unknown):value is number[]=>Array.isArray(value)&&value.length>0&&value.every(finite);
const range=(value:unknown):value is number[]=>numericArray(value)&&value.length===2;
const clone=(value:unknown)=>value===undefined?null:structuredClone(value);
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const normalize=(value:string)=>value.replace(/[^a-z0-9가-힣]/gi,'').toLowerCase();
const increasing=(values:number[])=>values.every((value,index)=>index===0||value>=values[index-1]!);
const containsNumber=(value:unknown):boolean=>finite(value)||(Array.isArray(value)&&value.some(containsNumber))||(object(value)&&Object.values(value).some(containsNumber));

function rankPay(tables:Record<string,unknown>){let best:{name:string;values:Record<string,number[]>;score:number}|null=null;for(const[name,value]of Object.entries(tables)){if(!object(value))continue;const rows:Array<[string,Record<string,unknown>]>=[];for(const[key,row]of Object.entries(value))if(RANKS.includes(key.toUpperCase())&&object(row))rows.push([key,row]);const fields=new Map<string,number>();for(const[,row]of rows)for(const[key,entry]of Object.entries(row))if(range(entry))fields.set(key,(fields.get(key)??0)+1);for(const[field,count]of fields){const values:Record<string,number[]>={};for(const[key,row]of rows){const entry=row[field];if(range(entry))values[key.toUpperCase()]=entry;}const score=count+(/pay|gold/i.test(field)?3:/reward/i.test(field)?2:0);if(!best||score>best.score)best={name,values,score};}}return best;}

interface ArrayTarget { path:string; owner:Record<string,unknown>; key:string; value:number[]; }
function arrayTargets(root:unknown,keyPattern:RegExp,path='$',seen=new Set<object>()):ArrayTarget[]{if(!root||typeof root!=='object'||seen.has(root as object))return[];seen.add(root as object);const found:ArrayTarget[]=[];if(Array.isArray(root)){root.forEach((value,index)=>found.push(...arrayTargets(value,keyPattern,`${path}[${index}]`,seen)));return found;}for(const[key,value]of Object.entries(root as Record<string,unknown>)){const next=path==='$'?key:`${path}.${key}`;if(keyPattern.test(key)&&numericArray(value))found.push({path:next,owner:root as Record<string,unknown>,key,value});found.push(...arrayTargets(value,keyPattern,next,seen));}return found;}
function flatNumericSources(tables:Record<string,unknown>){const values:Array<{name:string;value:number[]}>=[];for(const[name,value]of Object.entries(tables)){if(numericArray(value))values.push({name,value});else if(object(value)){const rows=Object.entries(value);if(rows.length>=2&&rows.every(([key,entry])=>RANKS.includes(key.toUpperCase())&&finite(entry))){const byRank=Object.fromEntries(rows.map(([key,entry])=>[key.toUpperCase(),entry])) as Record<string,number>;values.push({name,value:RANKS.flatMap(rank=>finite(byRank[rank])?[byRank[rank]!]:[])});}}}return values;}

interface EntityPatchCandidate { path:string; owner:Record<string,unknown>; field:string; to:number; }
function entityCandidates(schema:Record<string,unknown>,source:Record<string,number>,field:(key:string)=>boolean){const candidates:Array<{patches:EntityPatchCandidate[]}>=[];if(!Array.isArray(schema.entities))return candidates;for(const rawBlock of schema.entities){if(!object(rawBlock)||!Array.isArray(rawBlock.instances))continue;const instances=rawBlock.instances.filter(object),identity=(instance:Record<string,unknown>)=>['id','no','name'].map(key=>instance[key]).find(value=>typeof value==='string'||typeof value==='number');const sourceKeys=Object.keys(source),fields=[...new Set(instances.flatMap(instance=>Object.keys(instance).filter(key=>field(key)&&finite(instance[key]))))];for(const targetField of fields){const eligible=instances.filter(instance=>finite(instance[targetField])&&identity(instance)!=null),eligibleKeys=eligible.map(instance=>String(identity(instance))).sort();if(!same(eligibleKeys,sourceKeys.slice().sort()))continue;const patches=eligible.map(instance=>{const id=String(identity(instance));return{path:`${String(rawBlock.type??'entity')}(${id}).${targetField}`,owner:instance,field:targetField,to:source[id]!};});if(patches.length)candidates.push({patches});}}
  return candidates;
}
function directNumericMap(value:unknown):Record<string,number>|null{if(!object(value))return null;const rows=Object.entries(value);return rows.length>=2&&rows.every(([,entry])=>finite(entry))?Object.fromEntries(rows) as Record<string,number>:null;}
function mapTargets(root:unknown,keyPattern:RegExp,path='$',seen=new Set<object>()):Array<{path:string;owner:Record<string,unknown>;key:string;value:Record<string,number>}>{if(!root||typeof root!=='object'||seen.has(root as object))return[];seen.add(root as object);const found:Array<{path:string;owner:Record<string,unknown>;key:string;value:Record<string,number>}>=[];if(Array.isArray(root)){root.forEach((value,index)=>found.push(...mapTargets(value,keyPattern,`${path}[${index}]`,seen)));return found;}for(const[key,value]of Object.entries(root as Record<string,unknown>)){const next=path==='$'?key:`${path}.${key}`,map=directNumericMap(value);if(keyPattern.test(key)&&map)found.push({path:next,owner:root as Record<string,unknown>,key,value:map});found.push(...mapTargets(value,keyPattern,next,seen));}return found;}
function scalarTargets(root:unknown,wanted:string,path='$',seen=new Set<object>()):Array<{path:string;owner:Record<string,unknown>;key:string;value:number}>{if(!root||typeof root!=='object'||seen.has(root as object))return[];seen.add(root as object);const found:Array<{path:string;owner:Record<string,unknown>;key:string;value:number}>=[];if(Array.isArray(root)){root.forEach((value,index)=>found.push(...scalarTargets(value,wanted,`${path}[${index}]`,seen)));return found;}for(const[key,value]of Object.entries(root as Record<string,unknown>)){const next=path==='$'?key:`${path}.${key}`;if(finite(value)&&normalize(key)===normalize(wanted))found.push({path:next,owner:root as Record<string,unknown>,key,value});found.push(...scalarTargets(value,wanted,next,seen));}return found;}

export function patchSchemaWithMined(input:Record<string,unknown>,mined:MinedCard){
  const schema=structuredClone(input),patches:SchemaPatch[]=[],connected=new Set<string>();
  const patch=(path:string,owner:Record<string,unknown>,key:string,to:unknown,source:string)=>{connected.add(source);if(same(owner[key],to))return;patches.push({path,from:clone(owner[key]),to:clone(to),source});owner[key]=clone(to);};

  const pay=rankPay(mined.tables),rewards=object(schema.rewards)?schema.rewards:null,gold=rewards&&object(rewards.gold)?rewards.gold:null;
  if(pay&&gold){let matched=false;for(const[rank,to]of Object.entries(pay.values))if(rank in gold){matched=true;patch(`rewards.gold.${rank}`,gold,rank,to,pay.name);}if(matched)connected.add(pay.name);}

  const facilities=Array.isArray(schema.entities)?schema.entities.find(entry=>object(entry)&&entry.type==='facility') as Record<string,unknown>|undefined:undefined,instances=facilities&&Array.isArray(facilities.instances)?facilities.instances.filter(object):[];
  for(const[name,value]of Object.entries(mined.tables)){if(!object(value))continue;const hits=instances.filter(instance=>typeof instance.id==='string'&&numericArray(value[String(instance.id)]));if(hits.length<2)continue;let matched=false;for(const instance of hits){if(!('upgradeCosts' in instance))continue;matched=true;const values=value[String(instance.id)] as number[],to=Object.fromEntries(values.map((number,index)=>[String(index+2),number]));patch(`facility(${String(instance.id)}).upgradeCosts`,instance,'upgradeCosts',to,name);}if(matched)connected.add(name);}

  const sources=flatNumericSources(mined.tables);
  for(const target of arrayTargets(schema,/^thresholds$/i)){const compatible=sources.filter(source=>source.value.length===target.value.length&&increasing(source.value)&&increasing(target.value));if(compatible.length===1)patch(target.path,target.owner,target.key,compatible[0]!.value,compatible[0]!.name);}
  if(Array.isArray(schema.ladders))for(let ladderIndex=0;ladderIndex<schema.ladders.length;ladderIndex++){const ladder=schema.ladders[ladderIndex];if(!object(ladder)||!Array.isArray(ladder.ranks))continue;const ranks=ladder.ranks.filter(object),withNext=ranks.filter(rank=>finite(rank.next));const compatible=sources.filter(source=>source.value.length===withNext.length&&increasing(source.value));if(compatible.length!==1)continue;withNext.forEach((rank,index)=>patch(`ladders[${ladderIndex}].ranks[${index}].next`,rank,'next',compatible[0]!.value[index],compatible[0]!.name));}
  for(const target of arrayTargets(schema,/capacity/i)){const compatible=sources.filter(source=>!connected.has(source.name)&&source.value.length===target.value.length);if(compatible.length===1)patch(target.path,target.owner,target.key,compatible[0]!.value,compatible[0]!.name);}

  const numericMaps=Object.entries(mined.tables).flatMap(([name,value])=>{const map=directNumericMap(value);return map?[{name,value:map}]:[];});
  for(const target of mapTargets(schema,/capacity/i)){const keys=Object.keys(target.value).sort(),compatible=numericMaps.filter(source=>!connected.has(source.name)&&same(Object.keys(source.value).sort(),keys));if(compatible.length===1)patch(target.path,target.owner,target.key,compatible[0]!.value,compatible[0]!.name);}

  for(const[name,value]of Object.entries(mined.tables)){if(connected.has(name))continue;const map=directNumericMap(value);if(!map)continue;const capacity=entityCandidates(schema,map,key=>normalize(key)==='capacity'),requires=entityCandidates(schema,map,key=>normalize(key).startsWith('requires')),all=[...capacity,...requires];if(all.length!==1)continue;for(const item of all[0]!.patches)patch(item.path,item.owner,item.field,item.to,name);}

  for(const[source,to]of Object.entries(mined.constants)){const targets=scalarTargets(schema,source);if(targets.length!==1)continue;const target=targets[0]!;patch(target.path,target.owner,target.key,to,`constants.${source}`);connected.add(`constants.${source}`);}

  const unmatchedMinedValues:UnmatchedMinedValue[]=[];
  for(const[source,value]of Object.entries(mined.tables))if(containsNumber(value)&&!connected.has(source))unmatchedMinedValues.push({path:`tables.${source}`,value:clone(value),source,reason:'기존 스키마에서 모양이 유일하게 대응하는 숫자 필드를 찾지 못했습니다.'});
  for(const[source,value]of Object.entries(mined.constants))if(!connected.has(`constants.${source}`))unmatchedMinedValues.push({path:`constants.${source}`,value,source:`constants.${source}`,reason:'같은 이름의 기존 숫자 스칼라가 없거나 둘 이상이라 안전하게 고를 수 없습니다.'});
  return{schema,patches,unmatchedMinedValues};
}
