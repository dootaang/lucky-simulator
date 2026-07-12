import { describe,expect,it } from 'vitest';
import { createMemoryRepository } from '@simbot/persistence';
import { ChatStore,type ChatIndex } from '../src/index.ts';

describe('ChatStore',()=>{
  it('persists create, active selection, touch, rename, and removal across instances',async()=>{const repository=createMemoryRepository<ChatIndex>(),first=new ChatStore(repository,'card:inn'),one=await first.create(),two=await first.create('두 번째 모험');expect(one.name).toBe('1회차');expect(two.chatId).not.toBe(one.chatId);await first.setActive(one.chatId);await first.touch(one.chatId,12);await first.rename(one.chatId,'장기 플레이');const restored=await new ChatStore(repository,'card:inn').list();expect(restored.activeChatId).toBe(one.chatId);expect(restored.chats.find((chat)=>chat.chatId===one.chatId)).toMatchObject({name:'장기 플레이',turn:12});expect((await repository.get('card:inn:chatindex'))?.payload).toEqual(restored);await repository.put({id:`card:inn:chat:${two.chatId}`,schemaHash:'card:inn',title:'session placeholder',updatedAt:Date.now(),payload:restored});await first.remove(two.chatId);expect((await first.list()).chats.map((chat)=>chat.chatId)).toEqual([one.chatId]);expect(await repository.get(`card:inn:chat:${two.chatId}`)).toBeNull();});
  it('returns an empty index before the first chat is created',async()=>{const store=new ChatStore(createMemoryRepository<ChatIndex>(), 'card:empty');expect(await store.list()).toEqual({contract:'simbot-chat-index/0.1',projectId:'card:empty',chats:[],activeChatId:null});});
});
