import type { EvidenceReference, KnowledgeScope, MemoryKind, MemoryKnowledge, MemoryLifecycle, MemoryRecord, MemorySourceLocator } from '@simbot/contracts';

export interface Viewer { userId?: string; entityIds?: readonly string[] }
export interface Retrieval { records: MemoryRecord[]; abstained: boolean; reason?: string }
export interface ScoredMemory { record: MemoryRecord; evidenceScore: number }

export class MemoryLedger {
  #records = new Map<string, MemoryRecord>();
  add(record: MemoryRecord){validate(record);this.#records.set(record.id,structuredClone(record));}
  reset(records: MemoryRecord[]){this.#records.clear();for(const record of records)this.add(record);}
  approve(id: string){const value=this.#required(id);this.#records.set(id,{...value,status:'approved'});}
  reject(id: string){const value=this.#required(id);this.#records.set(id,{...value,status:'rejected'});}
  supersede(id: string,turn: number){const value=this.#required(id);this.#records.set(id,{...value,status:'superseded',validToTurn:turn,lifecycle:{...value.lifecycle,state:'superseded',timeScope:'past'}});}
  replace(record: MemoryRecord,turn: number){const anchors=new Set(record.canonicalAnchors??[]),supersedes:string[]=[];if(record.status!=='approved'||!anchors.size)throw new Error('memory_replacement_requires_approved_anchor');for(const value of this.#records.values())if(value.status==='approved'&&(value.canonicalAnchors??[]).some((anchor)=>anchors.has(anchor))){this.supersede(value.id,turn);supersedes.push(value.id);}this.add({...record,supersedes,lifecycle:{...record.lifecycle,state:'active',timeScope:'current'}});}
  get(id: string){const value=this.#records.get(id);return value?structuredClone(value):null;}
  all(){return[...this.#records.values()].map((value)=>structuredClone(value));}
  eligible(turn: number,viewer: Viewer={},includePast=false){return[...this.#records.values()].filter((value)=>(value.status==='approved'||value.status==='superseded'&&(includePast||value.validToTurn==null||value.validToTurn>=turn))&&value.validFromTurn<=turn&&(includePast||value.validToTurn==null||value.validToTurn>=turn)&&visible(value,viewer)).map((value)=>structuredClone(value));}
  score(query: string,turn: number,viewer: Viewer={},includePast=false){const terms=tokens(query);return this.eligible(turn,viewer,includePast).map((record)=>({record,evidenceScore:lexicalScore(terms,tokens(record.text))})).filter((entry)=>entry.evidenceScore>0).sort((a,b)=>b.evidenceScore-a.evidenceScore||b.record.validFromTurn-a.record.validFromTurn||a.record.id.localeCompare(b.record.id));}
  retrieve(query: string,turn: number,viewer: Viewer={},limit=8): Retrieval {const records=this.score(query,turn,viewer).slice(0,limit).map(({record})=>record);return records.length?{records,abstained:false}:{records:[],abstained:true,reason:'insufficient_grounding'};}
  #required(id: string){const value=this.#records.get(id);if(!value)throw new Error(`memory_not_found:${id}`);return value;}
}

function validate(value: MemoryRecord){if(!value.id||!value.text.trim())throw new Error('memory_invalid');if(!value.evidence.length)throw new Error('memory_evidence_required');if(value.validFromTurn<0||value.validToTurn!=null&&value.validToTurn<value.validFromTurn)throw new Error('memory_interval_invalid');}
function visible(value:MemoryRecord,viewer: Viewer){const scope=value.scope;if(scope.kind==='user'&&scope.userId!==viewer.userId)return false;if(scope.kind==='entity'&&!(viewer.entityIds??[]).includes(scope.entityId))return false;const knowledge=value.knowledge,entities=viewer.entityIds??[];if(knowledge?.state==='hidden'||knowledge?.state==='forgotten')return false;if(knowledge?.deniedToEntityIds?.some((id)=>entities.includes(id)))return false;if((knowledge?.privacy==='private'||knowledge?.privacy==='secret'||knowledge?.privacy==='internal')&&knowledge.holderEntityIds?.length&&!knowledge.holderEntityIds.some((id)=>entities.includes(id)))return false;return true;}
function tokens(value: string){return[...new Set(value.toLowerCase().match(/[가-힣]{2,}|[a-z0-9_-]{2,}/g)??[])];}
function lexicalScore(query: string[],document: string[]){return query.reduce((total,term)=>total+(document.some((value)=>value===term||value.includes(term)||term.includes(value))?1:0),0)/Math.max(1,query.length);}
export function memoryRecord(input: {id:string;text:string;turn:number;scope?:KnowledgeScope;evidence:EvidenceReference[];status?:MemoryRecord['status'];kind?:MemoryKind;sourceMessageIds?:readonly string[];sourceEventIndexes?:readonly number[];entities?:readonly string[];supersedes?:readonly string[];importance?:number;canonicalAnchors?:readonly string[];sceneId?:string;sourceLocator?:MemorySourceLocator;knowledge?:MemoryKnowledge;lifecycle?:MemoryLifecycle}): MemoryRecord {return{id:input.id,text:input.text,validFromTurn:input.turn,validToTurn:null,scope:input.scope??{kind:'public'},evidence:input.evidence,status:input.status??'candidate',...(input.kind?{kind:input.kind}:{}),...(input.sourceMessageIds?{sourceMessageIds:input.sourceMessageIds}:{}),...(input.sourceEventIndexes?{sourceEventIndexes:input.sourceEventIndexes}:{}),...(input.entities?{entities:input.entities}:{}),createdTurn:input.turn,...(input.supersedes?{supersedes:input.supersedes}:{}),...(input.importance!=null?{importance:input.importance}:{}),...(input.canonicalAnchors?{canonicalAnchors:input.canonicalAnchors}:{}),...(input.sceneId?{sceneId:input.sceneId}:{}),...(input.sourceLocator?{sourceLocator:input.sourceLocator}:{}),...(input.knowledge?{knowledge:input.knowledge}:{}),...(input.lifecycle?{lifecycle:input.lifecycle}:{})};}

export * from './abstention.ts';
export * from './embedding-cache.ts';
export * from './planner.ts';
export * from './semantic.ts';
export * from './narrative-verifier.ts';
export * from './providers/fixed.ts';
