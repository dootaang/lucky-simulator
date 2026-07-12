import { describe,expect,it } from 'vitest';
import { createMemoryRepository } from '@simbot/persistence';
import { parseCard } from '@simbot/card';
import { alternateForward,CardLibrary,summarizeEngineState } from './card-library';

describe('CardLibrary',()=>{
  it('base64 저장 후 같은 카드로 복원한다',async()=>{const repository=createMemoryRepository<unknown>(),library=new CardLibrary(repository),bytes=new TextEncoder().encode(JSON.stringify({spec:'chara_card_v3',spec_version:'3.0',data:{name:'테스트 카드',description:'설명'}})),parsed=parseCard(bytes,'test.json');expect(await library.saveCard(parsed,'card:test')).toBe(true);const restored=await library.loadCard('card:test');expect(restored?.name).toBe(parsed.name);expect([...restored!.sourceBytes]).toEqual([...bytes]);});
});
describe('리스 대안 버튼',()=>{it('중간에서는 다음 대안을 표시한다',()=>expect(alternateForward(0,2)).toEqual({kind:'show',index:1}));it('끝에서는 새 응답을 생성한다',()=>expect(alternateForward(2,2)).toEqual({kind:'reroll'}));});
describe('엔진 상태 요약',()=>{it('없는 골드는 표시하지 않는다',()=>expect(summarizeEngineState({day:3,resources:{food:4}})).toEqual([{label:'일차',value:'3'},{label:'식자재',value:'4'}]));});
