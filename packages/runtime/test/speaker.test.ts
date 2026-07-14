import { describe, expect, it } from 'vitest';
import { resolveSpeaker, resolveSpeakerList } from '../src/index.ts';

const schema={entities:[{type:'npc',instances:[{id:'aria',nameKo:'아리아',name:'Aria',nameEn:'ARIA',aliases:['용사','Ａｒｉａ 별칭']},{id:'boris',nameKo:'보리스'},{id:'celine',name:'Celine'},{id:'dana',name:'Dana'}]}]};
const state={npcs:{ARIA:{outfit:2},boris:{outfit:1}}};

describe('speaker resolver',()=>{
  it('maps Korean name, alias, and id to the canonical NPC and current outfit',()=>{
    for(const reference of ['아리아','  용사  ','ＡＲＩＡ'])expect(resolveSpeaker(schema,state,reference)).toMatchObject({id:'aria',name:'아리아',outfit:2});
    expect(resolveSpeaker(schema,state,'aria 별칭')).toMatchObject({id:'aria',name:'아리아',outfit:2});
  });
  it('returns the legacy raw-reference fallback for an unknown speaker',()=>{
    expect(resolveSpeaker(schema,state,'수수께끼')).toMatchObject({id:'수수께끼',name:'수수께끼'});
  });
  it('dedupes, caps at three, and selects one requested focus',()=>{
    const result=resolveSpeakerList(schema,state,[{npcId:'아리아',focus:true},{npcId:'ARIA'},{npcId:'보리스'},{npcId:'Celine',focus:true},{npcId:'Dana',focus:true}]);
    expect(result.map((entry)=>entry.npcId)).toEqual(['aria','boris','celine']);
    expect(result.map((entry)=>entry.focus)).toEqual([false,false,true]);
  });
  it('focuses the last entry when none is requested',()=>{
    expect(resolveSpeakerList(schema,state,[{npcId:'aria'},{npcId:'boris'}]).map((entry)=>entry.focus)).toEqual([false,true]);
  });
  it('drops model-invented speakers when the card declares its NPC roster',()=>{
    expect(resolveSpeakerList(schema,state,[{npcId:'YSP'},{npcId:'aria'}]).map((entry)=>entry.npcId)).toEqual(['aria']);
  });
});
