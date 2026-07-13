import {decompressSync} from 'fflate';
import {unpack} from 'msgpackr';

const MAX_PRESET_BYTES=16*1024*1024;
const RPACK_MAP='xA0eC70rP1X8RW71ZlNPGuC7MJSGumu/QVBvm+/etxBhFyDfMomonW2ryZAADF2v0sFW5RZkkYJldJfKI9ZS0f+0oOgvilg4WmAZlknb18g7PkNLpWNHqmopkvQVz2I0eNMdPOIFjipXDhvNTC3yQCwleUgPsnq1p2w35px7VH7+h9yaAuQzouuxLgPdmaaw59WIGIN89r7hXJ/DIUYfCE7QdhJf7v2PROqjXosoCTWeacwKx4UHrUrzd+ln1NqEgJO2TXP6JyZ/BMb78XI5UcI2qWis+O3FucvOdaQ9gdlCcByVEbzYjJj5WaET9xR9s+xxwOON8AGuWzEGJCI6uCz3hIvJZfu2n66zAy0BaXQf5KPs7lw0IZNKD2riYgKeIpz9PPxxx8atWWcFcG2KRBL6JIZfr9F6R87+UGPdUQZvGOBSqAmdVnNMuFNsw6AOGc8+DX4HMmhG6kj5mS6rpEkgXlU1OAy807FYFnkoChrh8s3EOduiumBydn2V73/IwN43lL+1FIGSJUWs5/Vmpys2WsET40s66I2DG3wnsJpC64eq3FSOeCbSVynUt/gvj4l18EF3wh7/2BUR5QSXF/Mx0JsA18q0Tyo72bJr2l2hPzBhvZE9Tubfvk2CjB0jEJhk9IUze5BDu6mI8dalHPbMbrlbC5bt1enFywimgEA=';

const asBytes=(value:unknown)=>value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):null;
const asRecord=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
function decodeBase64(value:string){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);return bytes;}
function decodeRPack(bytes:Uint8Array){const map=decodeBase64(RPACK_MAP).subarray(256),result=new Uint8Array(bytes.length);for(let index=0;index<bytes.length;index+=1)result[index]=map[bytes[index]!]!;return result;}
async function decryptPreset(bytes:Uint8Array){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('risupreset')),key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']),owned=new Uint8Array(bytes.length);owned.set(bytes);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(12)},key,owned));}

/** Decode Risu JSON, legacy .risupreset, and current RPack-wrapped .risup files. */
export async function decodeRisuPresetFile(bytes:Uint8Array,fileName:string):Promise<Record<string,unknown>>{
  if(!bytes.length||bytes.length>MAX_PRESET_BYTES)throw new Error('risu_preset_size_invalid');
  const lower=fileName.toLowerCase();
  if(!lower.endsWith('.risup')&&!lower.endsWith('.risupreset')){
    const parsed=JSON.parse(new TextDecoder().decode(bytes)) as unknown,record=asRecord(parsed);if(!record)throw new Error('risu_preset_json_invalid');return record;
  }
  try{
    const packed=lower.endsWith('.risup')?decodeRPack(bytes):bytes,outer=asRecord(unpack(decompressSync(packed)));
    if(!outer||outer.type!=='preset'||![0,2].includes(Number(outer.presetVersion)))throw new Error('risu_preset_envelope_invalid');
    const encrypted=asBytes(outer.preset??outer.pres);if(!encrypted)throw new Error('risu_preset_payload_missing');
    const inner=asRecord(unpack(await decryptPreset(encrypted)));if(!inner)throw new Error('risu_preset_payload_invalid');return inner;
  }catch(error){if(error instanceof Error&&error.message.startsWith('risu_preset_'))throw error;throw new Error('risu_preset_decode_failed',{cause:error});}
}
