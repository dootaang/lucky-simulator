export const PNG_SIGNATURE=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
export interface PngChunk{type:string;data:Uint8Array;raw:Uint8Array}
const decoder=new TextDecoder(),encoder=new TextEncoder();
export function readPngChunks(bytes:Uint8Array):PngChunk[]{
 if(bytes.length<20||!PNG_SIGNATURE.every((value,index)=>bytes[index]===value))throw new Error('png_signature_invalid');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks:PngChunk[]=[];let offset=8;
 while(offset+12<=bytes.length){const start=offset,length=view.getUint32(offset);offset+=4;if(length>bytes.length-offset-8)throw new Error('png_chunk_truncated');const type=decoder.decode(bytes.subarray(offset,offset+4));offset+=4;if(!/^[A-Za-z]{4}$/.test(type))throw new Error('png_chunk_type_invalid');const data=bytes.subarray(offset,offset+length);offset+=length+4;chunks.push({type,data,raw:bytes.slice(start,offset)});if(type==='IEND')break;}
 if(!chunks.some((chunk)=>chunk.type==='IEND'))throw new Error('png_iend_missing');return chunks;
}
export function makePngChunk(type:string,data:Uint8Array):Uint8Array{if(!/^[A-Za-z]{4}$/.test(type))throw new Error('png_chunk_type_invalid');const typeBytes=encoder.encode(type),out=new Uint8Array(12+data.length),view=new DataView(out.buffer);view.setUint32(0,data.length);out.set(typeBytes,4);out.set(data,8);view.setUint32(8+data.length,crc32(joinBytes(typeBytes,data)));return out;}
export function joinBytes(...parts:Uint8Array[]):Uint8Array{const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit+=1)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
