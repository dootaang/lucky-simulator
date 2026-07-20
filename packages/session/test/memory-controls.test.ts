import{describe,expect,it}from'vitest';
import{memoryRecord}from'@simbot/memory';
import type{PromptPreset}from'@simbot/risu';
import{ProjectRuntime}from'@simbot/runtime';
import{PlaySession}from'../src/index.ts';

const preset:PromptPreset={contract:'prompt-preset/0.1',id:'p',name:'p',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[]};
const runtime=()=>new ProjectRuntime({projectId:'memory-controls',schema:{initialState:{}},screens:[],navigation:[],content:{},featureToggles:{},moduleIds:[]});
const session=()=>new PlaySession({id:'memory-controls',runtime:runtime(),preset,card:{name:'Guide'},provider:{async complete(){return{text:'ok'};}}});

describe('user memory controls',()=>{
  it('corrects by superseding instead of overwriting and undo restores the original',async()=>{const value=session();value.memory.add(memoryRecord({id:'coffee',text:'커피를 싫어한다',turn:0,status:'approved',kind:'summary',canonicalAnchors:['preference:coffee'],evidence:[{kind:'message',id:'m1'}]}));await value.correctMemory('coffee','아메리카노만 싫어한다');expect(value.memory.get('coffee')?.status).toBe('superseded');expect(value.memory.all().find(record=>record.id.startsWith('user-correction:'))).toMatchObject({text:'아메리카노만 싫어한다',status:'approved',supersedes:['coffee']});await value.undoTurn();expect(value.memory.all()).toEqual([expect.objectContaining({id:'coffee',text:'커피를 싫어한다',status:'approved'})]);});
  it('forgets narrative memory without deleting its audit trail and supports undo',async()=>{const value=session();value.memory.add(memoryRecord({id:'rain',text:'비 오는 날을 좋아한다',turn:0,status:'approved',kind:'summary',evidence:[{kind:'message',id:'m1'}]}));await value.forgetMemory('rain');expect(value.memory.get('rain')).toMatchObject({status:'superseded',knowledge:{state:'forgotten'}});expect(value.memory.retrieve('비 오는 날',1).records).toEqual([]);await value.undoTurn();expect(value.memory.get('rain')?.status).toBe('approved');});
  it('does not let user controls rewrite engine truth',async()=>{const value=session();value.memory.add(memoryRecord({id:'gold',text:'자금 100',turn:0,status:'approved',kind:'engine-fact',canonicalAnchors:['gold'],evidence:[{kind:'event',id:'0'}]}));await expect(value.correctMemory('gold','자금 999')).rejects.toThrow('engine_memory_correction_forbidden');await expect(value.forgetMemory('gold')).rejects.toThrow('engine_memory_forget_forbidden');expect(value.memory.get('gold')?.text).toBe('자금 100');});
});
