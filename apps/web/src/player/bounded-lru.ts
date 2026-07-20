export class BoundedLru<T>{
  readonly #values=new Map<string,T>();
  constructor(readonly limit:number,readonly onEvict:(value:T,key:string)=>void=()=>{}){if(!Number.isInteger(limit)||limit<1)throw new Error('bounded_lru_limit_invalid');}
  get size(){return this.#values.size;}
  has(key:string){return this.#values.has(key);}
  peek(key:string){return this.#values.get(key);}
  get(key:string){const value=this.#values.get(key);if(value===undefined)return undefined;this.#values.delete(key);this.#values.set(key,value);return value;}
  set(key:string,value:T){const previous=this.#values.get(key);if(previous!==undefined&&previous!==value)this.onEvict(previous,key);this.#values.delete(key);this.#values.set(key,value);while(this.#values.size>this.limit){const oldest=this.#values.entries().next().value as [string,T]|undefined;if(!oldest)break;this.#values.delete(oldest[0]);this.onEvict(oldest[1],oldest[0]);}return value;}
  delete(key:string){const value=this.#values.get(key);if(value===undefined)return false;this.#values.delete(key);this.onEvict(value,key);return true;}
  clear(){for(const[key,value]of this.#values)this.onEvict(value,key);this.#values.clear();}
}
