export interface CardBinaryStore {
  put(projectId:string,bytes:Uint8Array):Promise<void>;
  get(projectId:string):Promise<Uint8Array|null>;
  delete(projectId:string):Promise<void>;
}
export interface AssetModuleStore{put(moduleId:string,blob:Blob):Promise<void>;get(moduleId:string):Promise<Blob|null>;delete(moduleId:string):Promise<void>}
export interface AssetThumbnailStore{get(key:string):Promise<Blob|null>;put(key:string,moduleId:string,blob:Blob):Promise<void>;prune(maxEntries:number,maxBytes:number):Promise<number>;deleteModule(moduleId:string):Promise<void>}

interface ThumbnailRow{blob:Blob;moduleId:string;accessedAt:number;size:number}
const DB_NAME='lucky-simulator-card-blobs', STORE='cards', MODULE_STORE='modules', THUMB_STORE='asset-thumbnails', VERSION=3;
export const LARGE_CARD_WARNING_BYTES=100*1024*1024;
export function needsLargeCardWarning(size:number){return size>LARGE_CARD_WARNING_BYTES;}

function request<T>(value:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error??new Error('card_blob_request_failed'));});}
async function openDb(){return await new Promise<IDBDatabase>((resolve,reject)=>{const value=indexedDB.open(DB_NAME,VERSION);value.onupgradeneeded=()=>{if(!value.result.objectStoreNames.contains(STORE))value.result.createObjectStore(STORE);if(!value.result.objectStoreNames.contains(MODULE_STORE))value.result.createObjectStore(MODULE_STORE);if(!value.result.objectStoreNames.contains(THUMB_STORE))value.result.createObjectStore(THUMB_STORE);};value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error??new Error('card_blob_open_failed'));});}

export function createBrowserCardBinaryStore():CardBinaryStore{
  const run=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>)=>{const db=await openDb();try{return await request(work(db.transaction(STORE,mode).objectStore(STORE)));}finally{db.close();}};
  return{
    async put(projectId,bytes){await run('readwrite',(store)=>store.put(bytes.slice().buffer,projectId));},
    async get(projectId){const value=await run<ArrayBuffer|undefined>('readonly',(store)=>store.get(projectId));return value?new Uint8Array(value):null;},
    async delete(projectId){await run('readwrite',(store)=>store.delete(projectId));}
  };
}

export function createBrowserAssetModuleStore():AssetModuleStore{const run=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>)=>{const db=await openDb();try{return await request(work(db.transaction(MODULE_STORE,mode).objectStore(MODULE_STORE)));}finally{db.close();}};return{async put(id,blob){await run('readwrite',store=>store.put(blob,id));},async get(id){return(await run<Blob|undefined>('readonly',store=>store.get(id)))??null;},async delete(id){await run('readwrite',store=>store.delete(id));}};}
export function createBrowserAssetThumbnailStore():AssetThumbnailStore{
  const run=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>)=>{const db=await openDb();try{return await request(work(db.transaction(THUMB_STORE,mode).objectStore(THUMB_STORE)));}finally{db.close();}};
  return{
    async get(key){const row=await run<ThumbnailRow|undefined>('readonly',store=>store.get(key));if(!row)return null;void run('readwrite',store=>store.put({...row,accessedAt:Date.now()},key)).catch(()=>{});return row.blob;},
    async put(key,moduleId,blob){await run('readwrite',store=>store.put({blob,moduleId,accessedAt:Date.now(),size:blob.size} satisfies ThumbnailRow,key));},
    async prune(maxEntries,maxBytes){const db=await openDb();try{const tx=db.transaction(THUMB_STORE,'readwrite'),store=tx.objectStore(THUMB_STORE),keyRequest=store.getAllKeys(),rowRequest=store.getAll(),[keys,rows]=await Promise.all([request(keyRequest),request<ThumbnailRow[]>(rowRequest)]),items=rows.map((row,index)=>({row,key:keys[index]!})).sort((a,b)=>b.row.accessedAt-a.row.accessedAt),keep=new Set<IDBValidKey>();let bytes=0;for(const item of items)if(keep.size<maxEntries&&bytes+item.row.size<=maxBytes){keep.add(item.key);bytes+=item.row.size;}let removed=0;for(const item of items)if(!keep.has(item.key)){store.delete(item.key);removed+=1;}await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('thumbnail_prune_failed'));tx.onabort=()=>reject(tx.error??new Error('thumbnail_prune_aborted'));});return removed;}finally{db.close();}},
    async deleteModule(moduleId){const db=await openDb();try{const tx=db.transaction(THUMB_STORE,'readwrite'),store=tx.objectStore(THUMB_STORE),keyRequest=store.getAllKeys(),rowRequest=store.getAll(),[keys,rows]=await Promise.all([request(keyRequest),request<ThumbnailRow[]>(rowRequest)]);rows.forEach((row,index)=>{if(row.moduleId===moduleId)store.delete(keys[index]!);});await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('thumbnail_delete_failed'));});}finally{db.close();}}
  };
}

export function createMemoryCardBinaryStore():CardBinaryStore{
  const values=new Map<string,Uint8Array>();
  return{async put(id,bytes){values.set(id,bytes.slice());},async get(id){return values.get(id)?.slice()??null;},async delete(id){values.delete(id);}};
}
export function createMemoryAssetModuleStore():AssetModuleStore{const values=new Map<string,Blob>();return{async put(id,blob){values.set(id,blob);},async get(id){return values.get(id)??null;},async delete(id){values.delete(id);}};}
export function createMemoryAssetThumbnailStore():AssetThumbnailStore{const values=new Map<string,ThumbnailRow>();return{async get(key){const row=values.get(key);if(!row)return null;row.accessedAt=Date.now();return row.blob;},async put(key,moduleId,blob){values.set(key,{blob,moduleId,accessedAt:Date.now(),size:blob.size});},async prune(maxEntries,maxBytes){const items=[...values.entries()].sort((a,b)=>b[1].accessedAt-a[1].accessedAt);let bytes=0,kept=0,removed=0;for(const[key,row]of items)if(kept<maxEntries&&bytes+row.size<=maxBytes){kept+=1;bytes+=row.size;}else{values.delete(key);removed+=1;}return removed;},async deleteModule(moduleId){for(const[key,row]of values)if(row.moduleId===moduleId)values.delete(key);}};}
