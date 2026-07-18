import { createRng, createState } from "@simbot/kernel";
import { createCoreRegistry, gflModule } from "@simbot/modules";

const ratios=[.5,.75,1,1.5], runs=500, missionPower=6000;
const dolls=[
  {id:"sg",name:"SG",class:"SG",grade:3,maxHp:1200,power:1000}, {id:"smg",name:"SMG",class:"SMG",grade:3,maxHp:1000,power:1000},
  {id:"ar1",name:"AR1",class:"AR",grade:3,maxHp:900,power:1000}, {id:"ar2",name:"AR2",class:"AR",grade:3,maxHp:900,power:1000},
  {id:"rf",name:"RF",class:"RF",grade:3,maxHp:800,power:1000}, {id:"hg",name:"HG",class:"HG",grade:3,maxHp:800,power:1000},
  ...Array.from({length:6},(_,i)=>({id:`pure${i}`,name:`AR${i+1}`,class:"AR",grade:3,maxHp:900,power:1000})),
];
const formations={"순수 AR×6":["pure0","pure1","pure2","pure3","pure4","pure5"],"균형 정배치":["sg","smg","ar1","ar2","rf","hg"],"균형 역배치":["rf","ar1","ar2","hg","sg","smg"]};
function schema(slots:string[],ratio:number,stars=0){
  const required=missionPower/ratio,enemies=Array.from({length:5},(_,i)=>({id:`enemy${i}`,power:required/5,hp:required/5*1.5}));
  return{initialState:{day:1,gold:0,resources:{res:0},items:{},player:{pools:{hp:{cur:1,max:1},mp:{cur:1,max:1}}},clock:{day:1,hour:8,turn:0},location:"base-command",gfl:{started:true,dolls:Object.fromEntries(dolls.map(unit=>[unit.id,{...unit,hp:{cur:unit.maxHp,max:unit.maxHp},mp:{cur:1000,max:1000},basePower:unit.power,power:unit.power,status:"대기",equipment:[]}])) ,echelons:[{id:"e1",slots}],facilities:{},completedMissions:[],sortie:null,daily:{day:1,sortiesUsed:0,sortiesCompleted:0}}},resources:[],gather:{},party:{maxSize:6,roles:[]},time:{hoursPerStep:4},jobs:[],locations:[],combat:{},skills:{},gfl:{dolls,items:[],equipment:[],fairies:[],missions:[{id:"sim",name:"SIM",stars,power:required,enemy:"철혈",factions:["철혈"],enemies,rewards:{}}],facilities:[],hire:{},manufacturing:{},progression:{byStar:{0:3,1:5,2:7,3:8,4:9,5:10,6:11},missionTypes:[{key:"sweep",stepMod:0}],eventGuides:{}}}};
}
function play(slots:string[],ratio:number,seed:number,stars:number,single=false,skills=true){
  const source:any=schema(slots,ratio,stars),registry=createCoreRegistry().register(gflModule()),rng=createRng(seed);let state=createState(source,seed);
  if(!skills)for(const unit of Object.values((state.gfl as any).dolls) as any[])unit.mp.cur=0;
  state=registry.dispatch(source,state,{id:"gfl/sortie/start",params:{missionId:"sim",echelonId:"e1",missionType:"sweep"}},rng).state;
  if(single)(state.gfl as any).sortie.stages=[{type:"battle"}];
  while((state.gfl as any).sortie?.active){const sortie=(state.gfl as any).sortie,type=sortie.stages[sortie.current].type,id=type==="battle"||type==="boss"?"gfl/sortie/resolve":"gfl/sortie/stage",result=registry.dispatch(source,state,{id,params:{tactic:"balanced"}},rng);state=result.state;}
  return (state.gfl as any).lastBattle?.outcome==="victory"&&(state.gfl as any).completedMissions.includes("sim");
}
console.log(`GFL combat composition Monte Carlo — seeds 1..${runs}`);
console.log("| 편성 | 전투력비 0.5 | 0.75 | 1.0 | 1.5 |"); console.log("|---|---:|---:|---:|---:|");
const results:Record<string,number[]>={};
for(const [name,slots] of Object.entries(formations)){results[name]=ratios.map(ratio=>Array.from({length:runs},(_,i)=>play(slots,ratio,i+1,0,true)).filter(Boolean).length/runs*100);console.log(`| ${name} | ${results[name]!.map(value=>`${value.toFixed(1)}%`).join(" | ")} |`);}
const proper=results["균형 정배치"]![2]!,reverse=results["균형 역배치"]![2]!,low=Math.max(...Object.values(results).map(row=>row[0]!));
const baseline=Array.from({length:runs},(_,i)=>play(formations["균형 정배치"],1,20_000+i,0,true,false)).filter(Boolean).length/runs*100,
  skillDelta=proper-baseline;
const compositionPassed=proper>=55&&proper<=100&&proper-reverse>=5&&proper-reverse<=20&&low<30&&skillDelta<=15;
const operation=Object.fromEntries([0,4].map(stars=>[stars,Array.from({length:runs},(_,i)=>play(formations["균형 정배치"],1,10_000+stars*runs+i,stars)).filter(Boolean).length/runs*100])) as Record<string,number>;
const operationBaseline=Object.fromEntries([0,4].map(stars=>[stars,Array.from({length:runs},(_,i)=>play(formations["균형 정배치"],1,30_000+stars*runs+i,stars,false,false)).filter(Boolean).length/runs*100])) as Record<string,number>;
console.log("\n| 균형 정배치·전투력비 1.0 | 작전 완주율 |");console.log("|---|---:|");console.log(`| 0★ (3단계) | ${operation[0]!.toFixed(1)}% |`);console.log(`| 4★ (9단계) | ${operation[4]!.toFixed(1)}% |`);
const operationPassed=operation[0]!>=60&&operation[0]!<=90&&operation[4]!>=40&&operation[4]!<=75;
console.log(`skills @1.0: baseline=${baseline.toFixed(1)}%, enabled=${proper.toFixed(1)}%, delta=${skillDelta.toFixed(1)}%p (limit +15%p)`);
console.log(`operation baseline: 0★=${operationBaseline[0]!.toFixed(1)}%, 4★=${operationBaseline[4]!.toFixed(1)}%`);
console.log(`criteria: single proper=${proper.toFixed(1)}%, placement delta=${(proper-reverse).toFixed(1)}%p, ratio0.5 max=${low.toFixed(1)}%; operation 0★=${operation[0]!.toFixed(1)}%, 4★=${operation[4]!.toFixed(1)}% => ${compositionPassed&&operationPassed?"PASS":"FAIL"}`);
if(!compositionPassed||!operationPassed)process.exitCode=1;
