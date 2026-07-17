import{describe,expect,it}from'vitest';
import{partitionCardImportFiles}from'./asset-module-import';

describe('card and split asset module import',()=>{
  it('keeps one PNG card and every selected CharX module',()=>{const card={name:'소녀전선_잔불.png'},modules=[1,2,3].map(number=>({name:`소녀전선 에셋 모듈 ${number}번.charx`})),result=partitionCardImportFiles([modules[1]!,card,modules[0]!,modules[2]!]);expect(result.card).toBe(card);expect(result.modules).toEqual([modules[1],modules[0],modules[2]]);});
  it('uses the first CharX as the card when all selected files are CharX',()=>{const files=[{name:'card.charx'},{name:'assets-1.charx'},{name:'assets-2.zip'}],result=partitionCardImportFiles(files);expect(result.card).toBe(files[0]);expect(result.modules).toEqual(files.slice(1));});
  it('rejects selecting two card files as one import',()=>expect(()=>partitionCardImportFiles([{name:'one.png'},{name:'two.json'}])).toThrow('봇카드는 한 번에 하나만'));
});
