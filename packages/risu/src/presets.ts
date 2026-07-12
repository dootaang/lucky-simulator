import type {PromptPreset,Provenance} from './contracts.ts';
const source:Provenance={source:'compiler',path:'packages/risu/default-preset'};
export function defaultCardPreset():PromptPreset{return{contract:'prompt-preset/0.1',id:'risu-card',name:'리스 카드(산문)',compatibilityMode:'risu',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[
  {id:'main',type:'plain',name:'메인',enabled:true,role:'system',slot:'main',text:'',source},
  {id:'description',type:'description',name:'캐릭터 설명',enabled:true,role:'system',source},
  {id:'persona',type:'persona',name:'페르소나',enabled:true,role:'system',source},
  {id:'lorebook',type:'lorebook',name:'로어북',enabled:true,role:'system',source},
  {id:'memory',type:'memory',name:'메모리',enabled:true,role:'system',source},
  {id:'chat',type:'chat',name:'대화',enabled:true,rangeStart:-40,rangeEnd:'end',source},
  {id:'post',type:'plain',name:'후속 지시',enabled:true,role:'system',slot:'globalNote',text:'',source},
  {id:'engine-facts',type:'engineFacts',name:'엔진 사실',enabled:false,role:'system',source},
  {id:'actions',type:'availableActions',name:'엔진 행동',enabled:false,role:'system',source},
  {id:'grounded',type:'groundedMemory',name:'근거 기억',enabled:false,role:'system',source}
]};}
export function enginePreset():PromptPreset{return{contract:'prompt-preset/0.1',id:'engine-default',name:'SimPack 기본',compatibilityMode:'simpack',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'main',type:'plain',name:'기본',enabled:true,role:'system',text:'JSON으로 응답하세요. text는 서사, events는 필요한 엔진 이벤트입니다.',source},{id:'chat',type:'chat',name:'대화',enabled:true,rangeStart:-40,rangeEnd:'end',source},{id:'facts',type:'engineFacts',name:'엔진 사실',enabled:true,role:'system',source},{id:'actions',type:'availableActions',name:'행동',enabled:true,role:'system',source},{id:'memory',type:'groundedMemory',name:'기억',enabled:true,role:'system',source}]};}
