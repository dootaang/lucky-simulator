export interface TextPanelDeclaration {id:string;kind:'panel'|'feed';fields:string[];source?:string;}
export interface TextTranslationEvent {id:string;params:Record<string,unknown>;}
export interface TextTranslation {events:TextTranslationEvent[];residue:string;}
export type TextTranslator=(text:string)=>TextTranslation;

function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function clean(value:string){return value.replace(/\n{3,}/g,'\n\n').trim();}

/** Converts declared field chains in model prose into panel_sync events. */
export function createPanelTranslator(declarations:readonly TextPanelDeclaration[]):TextTranslator{
  const matchers=declarations.flatMap(decl=>{
    if(!decl.id||!decl.fields.length||!decl.fields.every(field=>typeof field==='string'&&field.length>0))return[];
    const fields=decl.fields.map(escapeRegExp),body=fields.map(field=>`${field}\\s*:\\s*([^|]+?)\\s*\\|`).join('\\s*'),source=decl.kind==='feed'?`\\|\\s*${body}`:`(?:\\|\\s*)?${body}`;
    return[{decl,regex:new RegExp(source,'gu')}];
  });
  return(text:string)=>{
    const events:TextTranslationEvent[]=[];let residue=String(text??'');
    for(const{decl,regex}of matchers)residue=residue.replace(regex,(tag,...args:unknown[])=>{const fields=Object.fromEntries(decl.fields.map((label,index)=>[label,String(args[index]??'').trim()]));events.push({id:'panel_sync',params:{panelId:decl.id,fields}});return'';});
    return{events,residue:clean(residue)};
  };
}

/** Applies translators in order, feeding each residue to the next and joining their events. */
export function composeTextTranslators(...translators:readonly TextTranslator[]):TextTranslator{
  return(text:string)=>translators.reduce<TextTranslation>((current,translator)=>{const next=translator(current.residue);return{events:[...current.events,...next.events],residue:next.residue};},{events:[],residue:String(text??'')});
}
