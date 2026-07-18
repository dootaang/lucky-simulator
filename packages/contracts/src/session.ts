import type { JsonObject } from './json.ts';

export interface EngineJournalEvent { readonly index:number;readonly parentIndex:number;readonly event:{readonly id:string;readonly params:JsonObject};readonly ok:boolean;readonly log:readonly JsonObject[];readonly stateHash:string;readonly rng:number; }
export interface EngineJournalHead { readonly index:number;readonly stateHash:string;readonly rng:number; }
export interface EngineJournalInitial { readonly state:JsonObject;readonly rng:number; }
export interface SealedEngineJournalEpoch { readonly schemaHash:string;readonly initial:EngineJournalInitial;readonly events:readonly EngineJournalEvent[];readonly head:EngineJournalHead;readonly sealedIndex:number;readonly sealHash:string; }
interface EngineJournalCurrent { readonly schemaHash:string;readonly initial:EngineJournalInitial;readonly snapshotInterval:number;readonly events:readonly EngineJournalEvent[];readonly cursor:number;readonly head:EngineJournalHead; }
export interface EngineJournalDataV01 extends EngineJournalCurrent { readonly contract:'simbot-event-journal/0.1'; }
export interface EngineJournalDataV02 extends EngineJournalCurrent { readonly contract:'simbot-event-journal/0.2';readonly sealedEpochs:readonly SealedEngineJournalEpoch[];readonly baseIndex:number; }
export type EngineJournalData=EngineJournalDataV01|EngineJournalDataV02;
