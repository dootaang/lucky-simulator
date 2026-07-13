import { parseCard, type CardFormat, type ParsedCard } from '@simbot/card';
import type { SessionRepository } from '@simbot/persistence';
import type { CompileResult } from '@simbot/compiler';
import type { CardBinaryStore } from './card-binary-store';

export interface CardLibraryEntry { projectId:string; name:string; format:CardFormat; bytes?:string; binary?:'external'; size?:number; addedAt:number; }
export interface CardLibraryMeta { projectId:string; name:string; format:CardFormat|null; addedAt:number; missing?:boolean; }
interface CardLibraryIndex { contract:'simbot-card-library/0.1'; cards:CardLibraryMeta[]; }

// CHUNK는 String.fromCharCode 스프레드 인자 상한(엔진별 상이)을 넉넉히 밑돌게 8K로(감사 #6).
const INDEX_ID='cardlib:index', MAX_INLINE_BYTES=10*1024*1024, CHUNK=0x2000;
const repo=<T>(repository:SessionRepository<unknown>)=>repository as SessionRepository<T>;
export function bytesToBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=CHUNK)binary+=String.fromCharCode(...bytes.subarray(i,i+CHUNK));return btoa(binary);}
export function base64ToBytes(value:string){const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)out[i]=binary.charCodeAt(i);return out;}
export class CardLibrary {
  constructor(private readonly repository:SessionRepository<unknown>,private readonly binaries?:CardBinaryStore){}
  async nextInstance(projectId:string){const index=await this.index();if(!index.cards.some(card=>card.projectId===projectId))return{projectId,nameSuffix:''};let n=2;while(index.cards.some(card=>card.projectId===`${projectId}:${n}`))n+=1;return{projectId:`${projectId}:${n}`,nameSuffix:` (${n})`};}
  async saveCard(parsed:ParsedCard,projectId:string,nameSuffix=''){const base={projectId,name:`${parsed.name||projectId}${nameSuffix}`,format:parsed.format,size:parsed.sourceBytes.length,addedAt:Date.now()};let entry:CardLibraryEntry;if(this.binaries){try{await this.binaries.put(projectId,parsed.sourceBytes);entry={...base,binary:'external'};}catch{return false;}}else{if(parsed.sourceBytes.length>MAX_INLINE_BYTES)return false;entry={...base,bytes:bytesToBase64(parsed.sourceBytes)};}await repo<CardLibraryEntry>(this.repository).put({id:`cardlib:${projectId}`,schemaHash:'cardlib',title:entry.name,updatedAt:entry.addedAt,payload:entry});const index=await this.index();index.cards=index.cards.filter(card=>card.projectId!==projectId);const meta:CardLibraryMeta={projectId:entry.projectId,name:entry.name,format:entry.format,addedAt:entry.addedAt};index.cards.unshift(meta);await this.saveIndex(index);return true;}
  async listCards(){return (await this.index()).cards;}
  async loadCard(projectId:string){const row=await repo<CardLibraryEntry>(this.repository).get(`cardlib:${projectId}`);if(!row)return null;const data=row.payload.binary==='external'?await this.binaries?.get(projectId):row.payload.bytes?base64ToBytes(row.payload.bytes):null;return data?parseCard(data,row.payload.name):null;}
  async listOrphanProjects(){const known=new Set((await this.index()).cards.map(card=>card.projectId)),rows=await this.repository.list(),orphans=new Map<string,CardLibraryMeta>();for(const row of rows){const payload=row.payload as {contract?:string;projectId?:string}|null;if(payload?.contract!=='simbot-chat-index/0.1'||!payload.projectId||known.has(payload.projectId))continue;orphans.set(payload.projectId,{projectId:payload.projectId,name:'원본 카드 다시 연결',format:null,addedAt:row.updatedAt,missing:true});}return[...orphans.values()].sort((a,b)=>b.addedAt-a.addedAt);}
  async saveCompilation(projectId:string,result:CompileResult){await repo<CompileResult>(this.repository).put({id:`cardlib:${projectId}:compiler`,schemaHash:'cardlib-compiler',title:'Engine compilation',updatedAt:Date.now(),payload:structuredClone(result)});}
  async loadCompilation(projectId:string){return (await repo<CompileResult>(this.repository).get(`cardlib:${projectId}:compiler`))?.payload??null;}
  async removeCard(projectId:string){await this.repository.delete(`cardlib:${projectId}`);await this.repository.delete(`cardlib:${projectId}:compiler`);await this.binaries?.delete(projectId);const index=await this.index();index.cards=index.cards.filter(card=>card.projectId!==projectId);await this.saveIndex(index);}
  private async index(){const row=await repo<CardLibraryIndex>(this.repository).get(INDEX_ID);return row?.payload.contract==='simbot-card-library/0.1'?structuredClone(row.payload):{contract:'simbot-card-library/0.1' as const,cards:[]};}
  private async saveIndex(payload:CardLibraryIndex){await repo<CardLibraryIndex>(this.repository).put({id:INDEX_ID,schemaHash:'cardlib',title:'Card library',updatedAt:Date.now(),payload});}
}

export function alternateForward(current:number,last:number){return current<last?{kind:'show' as const,index:current+1}:{kind:'reroll' as const};}
export function summarizeEngineState(state:Record<string,unknown>){const rows:Array<{label:string;value:string}>=[];if('day'in state)rows.push({label:'일차',value:String(state.day)});if('gold'in state)rows.push({label:'골드',value:Number(state.gold).toLocaleString()});const resources=(state.resources&&typeof state.resources==='object'?state.resources:{})as Record<string,unknown>;if('food'in resources)rows.push({label:'식자재',value:String(resources.food)});if('drink'in resources)rows.push({label:'주류',value:String(resources.drink)});return rows;}
