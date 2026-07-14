import{describe,expect,it}from'vitest';
import{compilePrompt,defaultCardPreset,evaluateCbsConditions,parseCbs}from'../src/index.ts';

const conditional='{{#when::not::{{module_enabled::YSP_DLC}}}}기본 지시{{/when}}{{#when::{{module_enabled::YSP_DLC}}}}DLC 지시{{/when}}';

describe('safe module conditions',()=>{
  it('selects exactly one #when branch from the active module set',()=>{expect(evaluateCbsConditions(conditional)).toBe('기본 지시');expect(evaluateCbsConditions(conditional,{activeModules:['YSP_DLC']})).toBe('DLC 지시');});
  it('shares the same condition result with display CBS',()=>{expect(parseCbs(conditional,{variables:{},activeModules:[]})).toBe('기본 지시');expect(parseCbs(conditional,{variables:{},activeModules:['ysp-dlc']})).toBe('DLC 지시');});
  it('sends only the active post-history branch to the model',()=>{const card={name:'용사여관',postHistoryInstructions:conditional},base=compilePrompt({preset:defaultCardPreset(),card}).messages.map(message=>message.content).join('\n'),dlc=compilePrompt({preset:defaultCardPreset(),card,activeModules:['YSP_DLC']}).messages.map(message=>message.content).join('\n');expect(base).toContain('기본 지시');expect(base).not.toContain('DLC 지시');expect(dlc).toContain('DLC 지시');expect(dlc).not.toContain('기본 지시');expect(base+dlc).not.toContain('#when');});
});
