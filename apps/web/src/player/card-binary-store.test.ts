import{describe,expect,it}from'vitest';import{createMemoryAssetThumbnailStore,LARGE_CARD_WARNING_BYTES,needsLargeCardWarning}from'./card-binary-store';
import{assetThumbnailKey}from'./asset-thumbnail';
describe('large card import guard',()=>it('warns before files over 100MB are read into memory',()=>{expect(needsLargeCardWarning(LARGE_CARD_WARNING_BYTES)).toBe(false);expect(needsLargeCardWarning(LARGE_CARD_WARNING_BYTES+1)).toBe(true);}));
describe('persistent asset thumbnails',()=>{
  it('versions cache keys by module and path',()=>expect(assetThumbnailKey('module-a','portraits/M4A1.webp')).toBe('asset-thumb/1:module-a:portraits/M4A1.webp'));
  it('bounds cached blobs and can garbage-collect one module',async()=>{const store=createMemoryAssetThumbnailStore(),blob=(size:number)=>new Blob([new Uint8Array(size)]);await store.put('a','m1',blob(4));await store.put('b','m1',blob(4));await store.put('c','m2',blob(4));expect(await store.prune(2,8)).toBe(1);expect((await Promise.all(['a','b','c'].map(key=>store.get(key)))).filter(Boolean)).toHaveLength(2);await store.deleteModule('m1');expect(await store.get('a')).toBeNull();expect(await store.get('b')).toBeNull();});
});
