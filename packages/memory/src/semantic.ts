import type{MemoryLedger,Retrieval,Viewer}from'./index.ts';
import{EmbeddingCache}from'./embedding-cache.ts';
import{planGroundedMemory}from'./planner.ts';
export interface EmbeddingProvider{readonly modelId:string;readonly dimension:number;embedDocuments(texts:string[],signal?:AbortSignal):Promise<number[][]>;embedQueries(texts:string[],signal?:AbortSignal):Promise<number[][]>;}
export interface VoyageOptions{apiKey:string;model?:'voyage-context-3'|'voyage-context-4';dimension?:256|512|1024;fetch?:typeof globalThis.fetch;maxRetries?:number;batchSize?:number;cacheSize?:number;sleep?:(milliseconds:number)=>Promise<void>}
interface VoyageResponse{data?:Array<{embeddings?:number[][]}>}
const MAX_INPUTS=1000,MAX_CHUNKS=16000,MAX_TOKENS=120000;
export function maskSecrets(message:string,secrets:readonly string[]){return secrets.reduce((value,secret)=>secret?value.split(secret).join('[REDACTED]'):value,message);}
export function createVoyageProvider(options:VoyageOptions):EmbeddingProvider{
  const model=options.model??'voyage-context-3',dimension=options.dimension??1024,request=options.fetch??globalThis.fetch,cache=new EmbeddingCache(options.cacheSize??2048),sleep=options.sleep??((ms)=>new Promise((resolve)=>setTimeout(resolve,ms))),batchSize=Math.min(MAX_INPUTS,Math.max(1,options.batchSize??128));if(!request)throw new Error('fetch_unavailable');
  async function embed(texts:string[],inputType:'query'|'document',signal?:AbortSignal){
    if(texts.length>MAX_CHUNKS)throw new Error('voyage_limit_chunks');const estimates=texts.map(estimateTokens);if(estimates.some((tokens)=>tokens>MAX_TOKENS))throw new Error('voyage_limit_tokens');const output:Array<number[]|null>=texts.map((text)=>cache.get(cacheKey(inputType,text))??null),missing=texts.map((text,index)=>({text,index,tokens:estimates[index]??0})).filter(({index})=>!output[index]);
    for(let start=0;start<missing.length;){const batch:typeof missing=[];let tokens=0;while(start<missing.length&&batch.length<batchSize&&tokens+(missing[start]?.tokens??0)<=MAX_TOKENS){const entry=missing[start++];if(entry){batch.push(entry);tokens+=entry.tokens;}}if(!batch.length)throw new Error('voyage_limit_tokens');const body=JSON.stringify({inputs:batch.map(({text})=>[text]),model,input_type:inputType,output_dimension:dimension});let attempt=0;
      for(;;){if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');let response:Response;try{response=await request('https://api.voyageai.com/v1/contextualizedembeddings',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${options.apiKey}`},body,...(signal?{signal}:{})});}catch(error){throw safeError(error,options.apiKey);}if((response.status===429||response.status>=500)&&attempt<(options.maxRetries??3)){await sleep(Math.min(4000,250*2**attempt++));continue;}if(!response.ok)throw new Error(`voyage_http_${response.status}`);let parsed:VoyageResponse;try{parsed=await response.json()as VoyageResponse;}catch(error){throw safeError(error,options.apiKey);}batch.forEach((entry,index)=>{const vector=parsed.data?.[index]?.embeddings?.[0]??[];output[entry.index]=vector;cache.set(cacheKey(inputType,entry.text),vector);});break;}
    }
    return output.map((vector)=>vector??[]);
  }
  function cacheKey(type:string,text:string){return`${model}:${dimension}:${type}:${text}`;}
  return{modelId:model,dimension,embedDocuments:(texts,signal)=>embed(texts,'document',signal),embedQueries:(texts,signal)=>embed(texts,'query',signal)};
}
function estimateTokens(text:string){return Math.ceil(text.length/4);}
function safeError(error:unknown,apiKey:string){const message=error instanceof Error?error.message:String(error);return new Error(maskSecrets(message,[apiKey]));}
export async function retrieveHybrid(ledger:MemoryLedger,query:string,turn:number,provider:EmbeddingProvider,viewer:Viewer={},limit=8,signal?:AbortSignal):Promise<Retrieval>{return planGroundedMemory(ledger,query,{atTurn:turn,provider,viewer,limit,queryMode:'current',budgetTokens:Number.POSITIVE_INFINITY,abstention:{mode:'off'},...(signal?{signal}:{})});}
