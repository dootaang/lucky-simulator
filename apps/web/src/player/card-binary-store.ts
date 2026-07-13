export interface CardBinaryStore {
  put(projectId:string,bytes:Uint8Array):Promise<void>;
  get(projectId:string):Promise<Uint8Array|null>;
  delete(projectId:string):Promise<void>;
}
export interface AssetModuleStore{put(moduleId:string,blob:Blob):Promise<void>;get(moduleId:string):Promise<Blob|null>;delete(moduleId:string):Promise<void>}

const DB_NAME='lucky-simulator-card-blobs', STORE='cards', MODULE_STORE='modules', VERSION=2;
export const LARGE_CARD_WARNING_BYTES=100*1024*1024;
export function needsLargeCardWarning(size:number){return size>LARGE_CARD_WARNING_BYTES;}

function request<T>(value:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error??new Error('card_blob_request_failed'));});}
async function openDb(){return await new Promise<IDBDatabase>((resolve,reject)=>{const value=indexedDB.open(DB_NAME,VERSION);value.onupgradeneeded=()=>{if(!value.result.objectStoreNames.contains(STORE))value.result.createObjectStore(STORE);if(!value.result.objectStoreNames.contains(MODULE_STORE))value.result.createObjectStore(MODULE_STORE);};value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error??new Error('card_blob_open_failed'));});}

export function createBrowserCardBinaryStore():CardBinaryStore{
  const run=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>)=>{const db=await openDb();try{return await request(work(db.transaction(STORE,mode).objectStore(STORE)));}finally{db.close();}};
  return{
    async put(projectId,bytes){await run('readwrite',(store)=>store.put(bytes.slice().buffer,projectId));},
    async get(projectId){const value=await run<ArrayBuffer|undefined>('readonly',(store)=>store.get(projectId));return value?new Uint8Array(value):null;},
    async delete(projectId){await run('readwrite',(store)=>store.delete(projectId));}
  };
}

export function createBrowserAssetModuleStore():AssetModuleStore{const run=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>)=>{const db=await openDb();try{return await request(work(db.transaction(MODULE_STORE,mode).objectStore(MODULE_STORE)));}finally{db.close();}};return{async put(id,blob){await run('readwrite',store=>store.put(blob,id));},async get(id){return(await run<Blob|undefined>('readonly',store=>store.get(id)))??null;},async delete(id){await run('readwrite',store=>store.delete(id));}};}

export function createMemoryCardBinaryStore():CardBinaryStore{
  const values=new Map<string,Uint8Array>();
  return{async put(id,bytes){values.set(id,bytes.slice());},async get(id){return values.get(id)?.slice()??null;},async delete(id){values.delete(id);}};
}
export function createMemoryAssetModuleStore():AssetModuleStore{const values=new Map<string,Blob>();return{async put(id,blob){values.set(id,blob);},async get(id){return values.get(id)??null;},async delete(id){values.delete(id);}};}
