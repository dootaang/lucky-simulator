import{existsSync,readFileSync}from'node:fs';
import{describe,expect,it}from'vitest';
import{decodeRisuPresetFile,importRisuPreset,parsePromptTemplateToggles}from'../src/index.ts';

const actual='C:/freetalk/🎬온세무 28.4_preset.risup';
describe('Risu preset toggles',()=>{
 it('preserves controls and visual group structure from the line DSL',()=>{expect(parsePromptTemplateToggles('=그룹=group\nlang=언어=select=한국어, English\ncot=CoT\nwords=최소 글자=text\n=설명=caption\n=그룹=groupEnd')).toEqual([{type:'decor',label:'그룹',decor:'group'},{type:'select',key:'lang',label:'언어',options:['한국어','English']},{type:'boolean',key:'cot',label:'CoT'},{type:'text',key:'words',label:'최소 글자'},{type:'decor',label:'설명',decor:'caption'},{type:'decor',label:'그룹',decor:'groupEnd'}]);});
 it.runIf(existsSync(actual))('decodes the Onsemu 28.4 preset snapshot',async()=>{const raw=await decodeRisuPresetFile(readFileSync(actual),actual),toggles=importRisuPreset(raw).preset.toggles??[];expect({total:toggles.length,boolean:toggles.filter(item=>item.type==='boolean').length,select:toggles.filter(item=>item.type==='select').length,text:toggles.filter(item=>item.type==='text').length,decor:toggles.filter(item=>item.type==='decor').length,groups:toggles.filter(item=>item.type==='decor'&&item.decor==='group').length,groupEnds:toggles.filter(item=>item.type==='decor'&&item.decor==='groupEnd').length}).toEqual({total:54,boolean:12,select:18,text:5,decor:19,groups:4,groupEnds:4});expect(toggles.find(item=>item.type==='select'&&item.key==='lang')).toEqual({type:'select',key:'lang',label:'🌐출력 언어',options:['🇰🇷한국어','🇬🇧English','🇯🇵日本語']});});
});
