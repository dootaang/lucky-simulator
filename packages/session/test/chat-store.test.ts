import { describe,expect,it } from 'vitest';
import { createMemoryRepository } from '@simbot/persistence';
import { ChatStore,type ChatIndex } from '../src/index.ts';

describe('ChatStore',()=>{
  it('persists create, active selection, touch, rename, and removal across instances',async()=>{const repository=createMemoryRepository<ChatIndex>(),first=new ChatStore(repository,'card:inn'),one=await first.create(),two=await first.create('두 번째 모험');expect(one.name).toBe('1회차');expect(two.chatId).not.toBe(one.chatId);await first.setActive(one.chatId);await first.touch(one.chatId,12);await first.rename(one.chatId,'장기 플레이');const restored=await new ChatStore(repository,'card:inn').list();expect(restored.activeChatId).toBe(one.chatId);expect(restored.chats.find((chat)=>chat.chatId===one.chatId)).toMatchObject({name:'장기 플레이',turn:12});expect((await repository.get('card:inn:chatindex'))?.payload).toEqual(restored);await repository.put({id:`card:inn:chat:${two.chatId}`,schemaHash:'card:inn',title:'session placeholder',updatedAt:Date.now(),payload:restored});await first.remove(two.chatId);expect((await first.list()).chats.map((chat)=>chat.chatId)).toEqual([one.chatId]);expect(await repository.get(`card:inn:chat:${two.chatId}`)).toBeNull();});
  it('returns an empty index before the first chat is created',async()=>{const store=new ChatStore(createMemoryRepository<ChatIndex>(), 'card:empty');expect(await store.list()).toEqual({contract:'simbot-chat-index/0.1',projectId:'card:empty',chats:[],activeChatId:null});});
});

describe('채팅 정렬 — 리스 문법(최신이 위)',()=>{
  it('새 채팅이 맨 위에 오고 회차 번호는 겹치지 않는다',async()=>{
    const store=new ChatStore(createMemoryRepository(),'p');
    const a=await store.create(),b=await store.create(),c=await store.create();
    const list=await store.list();
    expect(list.chats.map((chat)=>chat.chatId)).toEqual([c.chatId,b.chatId,a.chatId]); // 최신이 위
    expect(list.chats.map((chat)=>chat.name)).toEqual(['3회차','2회차','1회차']);      // 낮은 회차가 아래
    expect(list.activeChatId).toBe(c.chatId);
    // 중간 채팅을 지우고 새로 만들어도 이름이 겹치지 않는다.
    await store.remove(b.chatId);
    const d=await store.create();
    const after=await store.list();
    expect(d.name).toBe('4회차');
    expect(after.chats[0]!.chatId).toBe(d.chatId);
    expect(new Set(after.chats.map((chat)=>chat.name)).size).toBe(after.chats.length);
  });
});
