import type{ParsedCard}from'@simbot/card';
import{screenPresetsFor}from'@simbot/modules';
import{extractRegexScripts}from'@simbot/risu';
import{buildCompilerPrompt}from'./compiler-prompt.ts';
import{diagnoseCard}from'./diagnosis.ts';
import{mineCard}from'./lua-mine.ts';
import{extractTextPanels}from'./text-panels.ts';
import type{CompileResult}from'./index.ts';

type Row=Record<string,unknown>;
const record=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const table=(value:unknown)=>record(value);
const number=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const text=(value:unknown)=>typeof value==='string'?value:String(value??'');
const id=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-|-$/g,'')||'entry';
function reward(value:unknown){const source=text(value),out:Row={};for(const[label,key]of [['자금','gold'],['자원','res'],['부품','parts'],['코어','cores']]as const){const match=new RegExp(`${label}\\s*\\+?\\s*([\\d,]+)`).exec(source);if(match)out[key]=Number(match[1]!.replace(/,/g,''));}return Object.keys(out).length?out:{gold:300,parts:100};}
function gflSignature(parsed:ParsedCard,mined:ReturnType<typeof mineCard>){const source=JSON.stringify(parsed.card),tables=mined.tables;return/소녀전선|girls.?frontline/i.test(source)&&Object.keys(table(tables.DOLL_CLASS)).length>=20&&Object.keys(table(tables.MISSION_DATA)).length>=3&&mined.luaSize>10_000;}
function dollRows(mined:ReturnType<typeof mineCard>){const classes=table(mined.tables.DOLL_CLASS),grades=table(mined.tables.DOLL_GRADE);return Object.entries(classes).map(([name,value])=>{const grade=Math.max(1,Math.min(6,number(grades[name],3)));return{id:id(name),name,class:text(value||'AR'),grade,maxHp:700+grade*100,power:300+grade*160,asset:name};});}
function itemRows(mined:ReturnType<typeof mineCard>){return Object.entries(table(mined.tables.ITEM_DATA)).map(([name,value])=>{const row=record(value);return{id:id(name),name,price:number(row.price),type:text(row.type),description:text(row.desc),effect:record(row.effect),asset:name};});}
function equipmentRows(mined:ReturnType<typeof mineCard>){return Object.entries(table(mined.tables.EQUIP_DATA)).map(([name,value])=>{const row=record(value);return{id:id(name),name,price:number(row.price),hp:number(row.hp),power:number(row.power),description:text(row.desc),effect:text(row.etc),ban:Array.isArray(row.ban)?row.ban:[],only:Array.isArray(row.only)?row.only:[],asset:name};});}
function missionRows(mined:ReturnType<typeof mineCard>){return Object.entries(table(mined.tables.MISSION_DATA)).map(([key,value])=>{const row=record(value);return{id:id(key),code:key,name:text(row.name||key),difficulty:text(row.diff),enemy:text(row.enemy),power:number(row.power,800),description:text(row.desc),rewards:reward(row.reward),rank:'E'};});}
function facilities(mined:ReturnType<typeof mineCard>){const effects=table(mined.tables.base_ab_data),costs=table(mined.tables.base_defaults),labels=['전술지휘부','방어시설','수복실','제조실','숙소'];return Array.from({length:5},(_,index)=>{const key=`base${index+1}`,cost=record(costs[key]);return{id:key,name:labels[index],maxLevel:5,cost:{gold:number(cost.gold,4000),res:number(cost.res,2000)},effects:Array.isArray(effects[key])?effects[key]:[]};});}
function gflSchema(parsed:ParsedCard,mined:ReturnType<typeof mineCard>){const dolls=dollRows(mined),items=itemRows(mined),equipment=equipmentRows(mined),missions=missionRows(mined),defaults=mined.defaultVars.numbers;return{
  meta:{id:'girls-frontline-ember',title:parsed.name,template:'genre.gfl',templateVersion:'1.0.0'},
  resources:[{id:'res',label:'자원',basePrice:1},{id:'parts',label:'부품',basePrice:10},{id:'cores',label:'코어',basePrice:2000}],
  gather:{small:[20,50],medium:[50,100],large:[100,200]},
  entities:[{type:'npc',instances:dolls.map(value=>({id:value.id,name:value.name,class:value.class,grade:value.grade,asset:value.asset}))}],
  locations:[{id:'base-command',name:'지휘관실',links:['base-repair','base-factory','base-shop','operation-map']},{id:'base-repair',name:'수복실',links:['base-command']},{id:'base-factory',name:'제조실',links:['base-command']},{id:'base-shop',name:'칼리나 상점',links:['base-command']},{id:'operation-map',name:'작전 지도',links:['base-command']}],
  party:{maxSize:5,roles:['slot1','slot2','slot3','slot4','slot5']},time:{startHour:8,hoursPerStep:4},
  combat:{d:20,minDamage:1,critMult:2,guardMult:.5,fleeRate:45,heavyRate:30,heavyMult:1.5,heavyAcc:-2,defeatReviveRatio:.2,expTable:{default:[10,20],E:[10,20],D:[20,40]},lootGold:{default:[50,100],E:[50,100],D:[100,200]}},
  skills:{focused_fire:{name:'집중 사격',pool:'mp',cost:100,power:20,acc:3}},
  jobs:[],equipment,items,
  gfl:{dolls,items,equipment,missions,facilities:facilities(mined),manufacturing:{doll:{gold:500,res:300},equipment:{gold:300,res:200},heavy:{gold:1500,res:1000,cores:1}},fairies:Object.entries(table(mined.tables.FAIRY_DATA)).map(([name,value])=>({id:id(name),name,...record(value)}))},
  initialState:{day:number(defaults.A_day,1),gold:number(defaults.A_gold,5000),resources:{res:number(defaults.A_res,3000),parts:5,cores:3},items:{},player:{level:1,exp:0,pools:{hp:{cur:1000,max:1000},mp:{cur:1000,max:1000}},atk:20,def:5,acc:5,evade:10},clock:{day:number(defaults.A_day,1),hour:8,turn:0},location:'base-command',party:{members:[],formation:{}},jobs:[],gfl:{started:false,mode:null,dolls:{},echelons:[{id:'echelon-1',name:'제1제대',slots:[null,null,null,null,null],fairyId:null},{id:'echelon-2',name:'제2제대',slots:[null,null,null,null,null],fairyId:null},{id:'echelon-3',name:'제3제대',slots:[null,null,null,null,null],fairyId:null}],facilities:{base1:1,base2:1,base3:1,base4:1,base5:1},fairies:{},manufacturing:[],repairs:[],completedMissions:[],sortie:null}}
};}

export function compileKnownCard(parsed:ParsedCard):CompileResult|null{
  const mined=mineCard(parsed);if(!gflSignature(parsed,mined))return null;
  const prompt=buildCompilerPrompt(parsed,mined),textPanels=extractTextPanels(extractRegexScripts(parsed)),diagnosis={...diagnoseCard(parsed,mined,prompt.coverage),textPanels},schema=gflSchema(parsed,mined),moduleIds=['genre.gfl'],presets=screenPresetsFor(moduleIds,schema);
  return{compilerVersion:'0.2',schema,moduleIds,screens:presets.screens,navigation:presets.navigation,patches:[],unmatchedMinedValues:[],issues:[{level:'warn',path:'runtime',message:'원본 저수준 Lua를 실행하지 않고 검증된 소녀전선 Lucky 템플릿으로 변환했습니다.',source:'template'}],warnings:['소녀전선 잔불 인증 변환판을 자동 적용했습니다.','AI 상태 태그는 게임 상태를 직접 변경하지 않습니다.'],attempts:[],diagnosis,rulebookUsed:prompt.coverage.rulebookText};
}
