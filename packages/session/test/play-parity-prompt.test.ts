import{describe,expect,it}from'vitest';
import{defaultCardPreset,type CompiledPrompt}from'@simbot/risu';
import{ProjectRuntime}from'@simbot/runtime';
import{PlaySession}from'../src/index.ts';

const banner='<div class="rp-image-wrap"><img src="{{raw::YSP_default}}" class="rp-image-card"></div>\n어서 오세요.';
function runtime(){return new ProjectRuntime({projectId:'inn',schema:{entities:[{type:'npc',instances:[{id:'silvia',nameKo:'실비아'}]}],initialState:{npcs:{silvia:{outfit:0}}}},screens:[],navigation:[],content:{activeModules:['YSP_DLC'],assetCommands:['YSP_default','silvia_default']},featureToggles:{},moduleIds:['genre.inn']});}

describe('play-parity prompts',()=>{
  it('keeps greeting prose but removes its decorative image from later model history',async()=>{let prompt:CompiledPrompt|undefined;const session=new PlaySession({id:'greeting-decoration',runtime:runtime(),preset:defaultCardPreset(),card:{name:'용사여관'},provider:{async complete(request){prompt=request.prompt;return{text:'새 응답'};}}});await session.seedGreeting(banner);await session.send('계속');const sent=prompt!.messages.map(message=>message.content).join('\n');expect(sent).toContain('어서 오세요.');expect(sent).not.toContain('YSP_default');expect(sent).not.toContain('rp-image-card');});
  it('grounds management narration in declared NPC sprites without copying the greeting banner',async()=>{let prompt:CompiledPrompt|undefined;const session=new PlaySession({id:'management-catalog',runtime:runtime(),preset:defaultCardPreset(),card:{name:'용사여관'},provider:{async complete(request){prompt=request.prompt;return{text:'실비아가 옷을 갈아입었다.'};}}});await session.seedGreeting(banner);await session.runManagementTurn('set_outfit',{npcId:'silvia',outfit:2});const sent=prompt!.messages.map(message=>message.content).join('\n');expect(sent).toContain('[등장 가능한 NPC]');expect(sent).toContain('silvia (실비아)');expect(sent).toContain('silvia_default');expect(sent).toContain('현재 장면의 화자 근거 없이 복사하지 않는다');expect(sent).not.toContain('YSP_default');});
});
