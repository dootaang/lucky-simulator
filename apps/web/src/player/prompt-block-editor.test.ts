import {describe,expect,it} from 'vitest';
import type {PromptPreset} from '@simbot/risu';
import {appendPlainBlock,insertMissingEngineBlocks,missingEngineBlockTypes,removePromptBlock,replaceBlockType} from './prompt-block-editor.js';

const source={source:'user' as const,path:'test'};
function preset():PromptPreset{return{contract:'prompt-preset/0.1',id:'p',name:'p',compatibilityMode:'risu',version:1,raw:null,settings:{assistantPrefill:'',sendNames:false,sendChatAsSystem:false},blocks:[{id:'main',type:'plain',name:'main',enabled:true,role:'system',text:'old',source},{id:'chat',type:'chat',name:'chat',enabled:true,rangeStart:-40,rangeEnd:'end',source}]};}

describe('prompt block editor',()=>{
 it('adds, converts, inserts engine blocks before chat, and deletes',()=>{
  let value=appendPlainBlock(preset(),'new');
  expect(value.blocks.at(-1)).toMatchObject({id:'new',type:'plain',text:''});
  value=replaceBlockType(value,2,'authornote');
  expect(value.blocks[2]).toMatchObject({id:'new',type:'authornote',name:'새 프롬프트 블록'});
  value=insertMissingEngineBlocks(value,type=>`engine-${type}`);
  expect(value.blocks.map(block=>block.type)).toEqual(['plain','engineFacts','availableActions','groundedMemory','chat','authornote']);
  value=removePromptBlock(value,5);
  expect(value.blocks.some(block=>block.id==='new')).toBe(false);
 });
 it('does not duplicate engine blocks',()=>{
  const value=insertMissingEngineBlocks(insertMissingEngineBlocks(preset(),type=>type),type=>`again-${type}`);
  expect(missingEngineBlockTypes(value)).toEqual([]);
  expect(value.blocks.filter(block=>block.type==='engineFacts')).toHaveLength(1);
 });
});
