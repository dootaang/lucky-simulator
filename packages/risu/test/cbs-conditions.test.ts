import{describe,expect,it}from'vitest';
import{compilePrompt,defaultCardPreset,evaluateCbsConditions,parseCbs}from'../src/index.ts';

const conditional='{{#when::not::{{module_enabled::YSP_DLC}}}}기본 지시{{/when}}{{#when::{{module_enabled::YSP_DLC}}}}DLC 지시{{/when}}';

describe('safe module conditions',()=>{
  it('selects exactly one #when branch from the active module set',()=>{expect(evaluateCbsConditions(conditional)).toBe('기본 지시');expect(evaluateCbsConditions(conditional,{activeModules:['YSP_DLC']})).toBe('DLC 지시');});
  it('shares the same condition result with display CBS',()=>{expect(parseCbs(conditional,{variables:{},activeModules:[]})).toBe('기본 지시');expect(parseCbs(conditional,{variables:{},activeModules:['ysp-dlc']})).toBe('DLC 지시');});
  it('reads emotion, card and module asset lists from the active render catalog',()=>{const assets=[{name:'face_smile',type:'emotion',mime:'image/png'},{name:'room',type:'image',mime:'image/png'},{name:'HK416_default',type:'module-asset',mime:'image/png',moduleNamespace:'gfl'}];expect(parseCbs('{{emotionlist}}|{{assetlist}}|{{moduleassetlist::gfl}}',{variables:{},assets})).toBe('["face_smile"]|["room"]|["HK416_default"]');});
  it('sends only the active post-history branch to the model',()=>{const card={name:'용사여관',postHistoryInstructions:conditional},base=compilePrompt({preset:defaultCardPreset(),card}).messages.map(message=>message.content).join('\n'),dlc=compilePrompt({preset:defaultCardPreset(),card,activeModules:['YSP_DLC']}).messages.map(message=>message.content).join('\n');expect(base).toContain('기본 지시');expect(base).not.toContain('DLC 지시');expect(dlc).toContain('DLC 지시');expect(dlc).not.toContain('기본 지시');expect(base+dlc).not.toContain('#when');});
  it('evaluates Risu preset select indexes in nested comparison expressions',()=>{const source='{{#if {{? {{getglobalvar::toggle_lang}}==0}} }}KO{{:else}}OTHER{{/if}}|{{#if {{? {{getglobalvar::toggle_lang}}==2}} }}JP{{/if}}';expect(parseCbs(source,{variables:{toggle_lang:'0'}})).toBe('KO|');expect(parseCbs(source,{variables:{toggle_lang:'2'}})).toBe('OTHER|JP');});
  it('evaluates Risu if_pure boolean toggles',()=>{const source='A{{#if_pure {{getglobalvar::toggle_cot}} }}COT{{/if}}Z';expect(parseCbs(source,{variables:{toggle_cot:'0'}})).toBe('AZ');expect(parseCbs(source,{variables:{toggle_cot:'1'}})).toBe('ACOTZ');});
});
