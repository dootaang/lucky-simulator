export const ASSET_THUMBNAIL_VERSION=1;
export const ASSET_THUMBNAIL_MAX_EDGE=192;
export const ASSET_THUMBNAIL_MAX_ENTRIES=2_048;
export const ASSET_THUMBNAIL_MAX_BYTES=64*1024*1024;

export function assetThumbnailKey(moduleId:string,path:string){return`asset-thumb/${ASSET_THUMBNAIL_VERSION}:${moduleId}:${path}`;}

export async function createAssetThumbnail(source:Blob,maxEdge=ASSET_THUMBNAIL_MAX_EDGE):Promise<Blob>{
  const bitmap=await createImageBitmap(source);
  try{
    const scale=Math.min(1,maxEdge/Math.max(1,bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    if(typeof OffscreenCanvas!=='undefined'){
      const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d',{alpha:true});
      if(!context)throw new Error('thumbnail_canvas_unavailable');
      context.drawImage(bitmap,0,0,width,height);
      return await canvas.convertToBlob({type:'image/webp',quality:.76});
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{alpha:true});if(!context)throw new Error('thumbnail_canvas_unavailable');
    context.drawImage(bitmap,0,0,width,height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('thumbnail_encode_failed')),'image/webp',.76));
  }finally{bitmap.close();}
}
