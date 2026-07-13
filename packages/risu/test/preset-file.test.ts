import {describe,expect,it} from 'vitest';
import {decodeRisuPresetFile} from '../src/preset-file.ts';

const RISUP='EAP8xGDppRvEC+kmgGcHTm2FZYUyAIVEZeXRsA5gYAW0WVbrQYOXQ+nG2uPFZwZVGV2kGOwGhX6qOBHQLNGVYOnyucUJpK46Odw89F+oWGAMBqfR9yGCQMFI0/wSD6SElQ3AjFTChM6196+hCsC3r0l7lwc6WWf3eK12232p9ThyFa0u+X1+5u6vNumS2K7qVOzf8GoHSsBdFMXa4+QAwZcBF/ccId+vU0bx8j/ExBEArHlfxMTE';
const RISUPRESET='H4sIAEm7VGoAA7vHwLy2oCi1OLUkLLWoODM/j2lJSWVB6jKIGJQ6UrvKvvTXvPsHSi7ck/H7tX9XR+ShcD/jSbtu2Neu3Pj+zoJjW6QmRkkt+3g/7Zw3bzFzYQijdNy/4wHz537Qv9p37S/rs/MeL0x9Orb+6rztYLeiTe/SC0fNXLeK6e9/e6Uv0bta5vipfvEj9li2uPMu7te+9IUsMTr3Ie3inCMvDZ3MbgYAAOQs1HKkAAAA';
const bytes=(value:string)=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));

describe('Risu preset files',()=>{
  it.each([['fixture.risup',RISUP],['fixture.risupreset',RISUPRESET]])('decodes encrypted %s files',async(fileName,value)=>{
    const preset=await decodeRisuPresetFile(bytes(value),fileName);
    expect(preset).toMatchObject({name:'Fixture',temperature:80,maxResponse:777});
    expect(preset.promptTemplate).toEqual([expect.objectContaining({type:'plain',text:'Hello'})]);
  });
  it('continues to accept plain JSON presets',async()=>{
    await expect(decodeRisuPresetFile(new TextEncoder().encode('{"name":"JSON"}'),'preset.json')).resolves.toEqual({name:'JSON'});
  });
  it('rejects an invalid encrypted envelope',async()=>{
    await expect(decodeRisuPresetFile(new Uint8Array([1,2,3]),'broken.risup')).rejects.toThrow('risu_preset_decode_failed');
  });
});
