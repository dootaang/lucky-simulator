import type {ModuleDefinition,RuntimeRecord} from '@simbot/kernel';
import {fail,list,moduleDefinition,ok,record,safeKey,scoped,string} from './support.ts';

export interface TextPanelSchemaDecl {id:string;kind:'panel'|'feed';fields:string[];source?:string;}
interface StoredPanel extends RuntimeRecord {fields:Record<string,string>;feed:string[];}

function declarations(schema:RuntimeRecord):TextPanelSchemaDecl[]{
  return list<RuntimeRecord>(schema.textPanels).flatMap(value=>{
    const id=string(value.id),kind=value.kind==='feed'?'feed':value.kind==='panel'?'panel':null,fields=list<unknown>(value.fields).filter((field):field is string=>typeof field==='string'&&field.length>0);
    return id&&kind&&fields.length?[{id,kind,fields,...(typeof value.source==='string'?{source:value.source}:{})}]:[];
  });
}

function stored(state:RuntimeRecord,id:string):StoredPanel{
  const value=record(record(state.panels)[id]);
  return{fields:Object.fromEntries(Object.entries(record(value.fields)).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),feed:list<unknown>(value.feed).filter((item):item is string=>typeof item==='string')};
}

function all(schema:RuntimeRecord,state:RuntimeRecord){
  return declarations(schema).map(decl=>{
    const value=stored(state,decl.id);
    return{id:decl.id,kind:decl.kind,fields:decl.fields.map(label=>({label,value:value.fields[label]??''})),feed:[...value.feed]};
  });
}

export function textPanelsModule():ModuleDefinition{return moduleDefinition('sim.text-panels',[],['panels'],[],{
  panel_sync:scoped(c=>{
    const panelId=typeof c.params.panelId==='string'?c.params.panelId:'',decl=declarations(c.schema).find(value=>value.id===panelId),input=c.params.fields;
    if(!decl||!safeKey(panelId))return fail(c,'unknown_panel',panelId);
    if(!input||typeof input!=='object'||Array.isArray(input))return fail(c,'invalid_panel_fields');
    const fields=input as Record<string,unknown>,allowed=new Set(decl.fields);
    for(const[label,value]of Object.entries(fields)){
      if(!allowed.has(label))return fail(c,'unknown_panel_field',label);
      if(typeof value!=='string')return fail(c,'panel_value_not_string',label);
    }
    if(!Object.keys(fields).length)return fail(c,'empty_panel_fields');
    const panels=record(c.state.panels),before=stored(c.state,panelId),nextFields={...before.fields,...fields as Record<string,string>},feed=decl.kind==='feed'?[...before.feed,...decl.fields.filter(label=>Object.prototype.hasOwnProperty.call(fields,label)).map(label=>fields[label] as string)].slice(-5):before.feed;
    panels[panelId]={fields:nextFields,feed};c.state.panels=panels;
    return ok(c,{panelId,fields:{...fields}});
  })
},{'panels/all':(...args)=>all(record(args[0]),record(args[1]))});}
