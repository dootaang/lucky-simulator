import type {PromptBlock,PromptPreset} from '@simbot/risu';

export const promptBlockTypes=['plain','cot','chat','description','persona','lorebook','authornote','memory','postEverything','cache','engineFacts','availableActions','groundedMemory'] as const;
export type EditablePromptBlockType=typeof promptBlockTypes[number];
type EditablePromptBlock=Exclude<PromptBlock,{type:'unsupported'}>;
export const engineBlockTypes=['engineFacts','availableActions','groundedMemory'] as const;

const source={source:'user' as const,path:'prompt-panel'};

export function makePromptBlock(type:EditablePromptBlockType,id:string,name?:string):EditablePromptBlock{
 const base={id,name:name??type,enabled:true,source};
 if(type==='plain'||type==='cot')return{...base,type,role:'system',text:'',slot:'normal'};
 if(type==='chat')return{...base,type,rangeStart:-40,rangeEnd:'end'};
 if(type==='cache')return{...base,type,depth:0,role:'all'};
 if(type==='engineFacts'||type==='availableActions'||type==='groundedMemory')return{...base,type,role:'system'};
 return{...base,type,role:'system'};
}

export function appendPlainBlock(preset:PromptPreset,id:string):PromptPreset{
 const copy=structuredClone(preset);
 copy.blocks.push(makePromptBlock('plain',id,'새 프롬프트 블록'));
 return copy;
}

export function replaceBlockType(preset:PromptPreset,index:number,type:EditablePromptBlockType):PromptPreset{
 const old=preset.blocks[index];
 if(!old||old.type===type)return preset;
 const copy=structuredClone(preset);
 copy.blocks[index]={...makePromptBlock(type,old.id,old.name),enabled:old.enabled,source:old.source};
 return copy;
}

export function removePromptBlock(preset:PromptPreset,index:number):PromptPreset{
 if(!preset.blocks[index])return preset;
 const copy=structuredClone(preset);
 copy.blocks.splice(index,1);
 return copy;
}

export function missingEngineBlockTypes(preset:PromptPreset){
 return engineBlockTypes.filter(type=>!preset.blocks.some(block=>block.type===type));
}

export function insertMissingEngineBlocks(preset:PromptPreset,idFor:(type:typeof engineBlockTypes[number])=>string):PromptPreset{
 const missing=missingEngineBlockTypes(preset);
 if(!missing.length)return preset;
 const labels={engineFacts:'엔진 사실',availableActions:'가능한 행동',groundedMemory:'검증된 기억'} as const;
 const copy=structuredClone(preset),chatIndex=copy.blocks.findIndex(block=>block.type==='chat');
 const blocks=missing.map(type=>makePromptBlock(type,idFor(type),labels[type]));
 copy.blocks.splice(chatIndex<0?copy.blocks.length:chatIndex,0,...blocks);
 return copy;
}
