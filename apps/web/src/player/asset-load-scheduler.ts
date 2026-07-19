export interface AssetLoadStats { active:number; queued:number; peak:number; started:number; completed:number; failed:number }

export class AssetLoadScheduler {
  readonly #limit:number;
  #active=0;#peak=0;#started=0;#completed=0;#failed=0;
  #queue:Array<()=>void>=[];
  constructor(limit=6){this.#limit=Math.max(1,Math.trunc(limit));}
  schedule<T>(task:()=>Promise<T>):Promise<T>{return new Promise<T>((resolve,reject)=>{const start=()=>{this.#active+=1;this.#started+=1;this.#peak=Math.max(this.#peak,this.#active);void task().then(value=>{this.#completed+=1;resolve(value);},reason=>{this.#failed+=1;reject(reason);}).finally(()=>{this.#active-=1;this.#pump();});};this.#queue.push(start);this.#pump();});}
  stats():AssetLoadStats{return{active:this.#active,queued:this.#queue.length,peak:this.#peak,started:this.#started,completed:this.#completed,failed:this.#failed};}
  #pump(){while(this.#active<this.#limit&&this.#queue.length)this.#queue.shift()?.();}
}
