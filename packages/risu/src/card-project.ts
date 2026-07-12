import { tagCompatibilityGrades } from './ysp-translate.ts';

interface ParsedCard { name:string; card:Record<string,unknown>; embeddedModules?:string[]; }
interface RuntimeProject { projectId:string; schema:Record<string,unknown>; screens:Record<string,unknown>[]; navigation:Record<string,unknown>[]; content:Record<string,unknown>; featureToggles:Record<string,unknown>; moduleIds?:string[]; }

export interface CardPassport {
  mode: 'full-sim' | 'chat';
  grades: { exact: string[]; approx: string[]; preserved: string[] };
  cardName: string;
}

export interface CardRuntimeProfile {
  project: RuntimeProject;
  passport: CardPassport;
  card: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    systemPrompt: string;
    postHistoryInstructions: string;
  };
  firstMessage: string;
}

export function cardToRuntimeProject(parsed: ParsedCard): CardRuntimeProfile {
  const root=parsed.card as Record<string,unknown>;
  const nested=root.data;
  const data=nested&&typeof nested==='object'&&!Array.isArray(nested)?nested as Record<string,unknown>:root;
  const characterBook=data.character_book;
  const book=characterBook&&typeof characterBook==='object'&&!Array.isArray(characterBook)?characterBook as Record<string,unknown>:{};
  const loreEntries=Array.isArray(book.entries)?book.entries.filter((entry):entry is Record<string,unknown>=>Boolean(entry)&&typeof entry==='object'&&!Array.isArray(entry)):[];
  const textPool=[data.description,data.first_mes,data.system_prompt,data.post_history_instructions,...loreEntries.map((entry)=>entry.content),...(parsed.embeddedModules??[])].map(text).filter(Boolean).join('\n');
  const grades=tagCompatibilityGrades(textPool);
  const hasTags=grades.exact.length+grades.approx.length+grades.preserved.length>0;
  const cardName=text(data.name)||parsed.name||'Imported card';
  const content={characters:[{id:'primary',name:cardName,description:text(data.description),personality:text(data.personality),scenario:text(data.scenario)}],lorebooks:loreEntries};
  const project:RuntimeProject={
    projectId:`card:${slug(cardName)}`,
    schema:hasTags?innSchema():{initialState:{day:1}},
    screens:[{id:'play',title:'플레이',layout:'stage-chat-sidebar',regions:{main:[{widget:'chat'}]}}],
    navigation:[{id:'play',screenId:'play',label:'플레이'}],
    content,featureToggles:{},moduleIds:hasTags?['genre.inn']:[]
  };
  return {
    project,
    passport:{mode:hasTags?'full-sim':'chat',grades,cardName},
    card:{name:cardName,description:text(data.description),personality:text(data.personality),scenario:text(data.scenario),systemPrompt:text(data.system_prompt),postHistoryInstructions:text(data.post_history_instructions)},
    firstMessage:text(data.first_mes)
  };
}

function innSchema():Record<string,unknown>{return{
  staffing:{facility:'quarter',capacityByLevel:{'1':1,'2':3}},
  scales:[{id:'affinity',owner:'npc',range:[0,200],default:20,steps:{S:1,M:3,L:6,XL:10,'S-':-1,'M-':-3,'L-':-6,'XL-':-10}}],
  entities:[
    {type:'facility',instances:[{id:'quarter',maxLevel:2},{id:'tavern',maxLevel:2},{id:'room',maxLevel:2},{id:'kitchen',maxLevel:2}]},
    {type:'npc',instances:[{id:'silvia',nameKo:'실비아'}]},
    {type:'room',instances:[{no:'101',capacity:1,requiresRoomLevel:1,pricePerNight:0}]}
  ],
  initialState:{day:1,gold:1_000_000,resources:{food:200,drink:200},items:{},facilities:{quarter:1,tavern:1,room:1,kitchen:1},staff:[],rooms:{},npcs:{silvia:{affinity:20}},player:{pools:{hp:{cur:10,max:10}}},combat:null}
};}
function text(value:unknown):string{return typeof value==='string'?value:'';}
function slug(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-+|-+$/g,'')||'card';}
