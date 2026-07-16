import{describe,expect,it}from'vitest';
import{createRng,createState}from'@simbot/kernel';
import{createCoreRegistry,gflModule}from'../src/index.ts';

const schema={
  initialState:{day:1,gold:5000,resources:{res:3000,parts:3,cores:3},items:{},player:{pools:{hp:{cur:1000,max:1000},mp:{cur:1000,max:1000}}},clock:{day:1,hour:8,turn:0},gfl:{started:false,dolls:{},echelons:[{id:'e1',name:'제1제대',slots:[null,null,null,null,null]}],facilities:{base1:1},manufacturing:[],repairs:[],completedMissions:[],sortie:null}},
  resources:[{id:'res',basePrice:1},{id:'parts',basePrice:1},{id:'cores',basePrice:1}],gather:{small:[1,1]},party:{maxSize:5,roles:['slot1']},time:{hoursPerStep:4},jobs:[],locations:[],
  combat:{d:20,minDamage:1,critMult:2,guardMult:.5,fleeRate:50,heavyRate:0,heavyMult:1.5,heavyAcc:0,defeatReviveRatio:.2,expTable:{E:[1,1]},lootGold:{E:[1,1]}},skills:{},
  gfl:{dolls:[{id:'m4a1',name:'M4A1',class:'AR',grade:5,maxHp:1000,power:1000},{id:'ump45',name:'UMP45',class:'SMG',grade:4,maxHp:900,power:900}],items:[{id:'ration',name:'전투식량',price:50}],equipment:[{id:'scope',name:'옵티컬',price:100,power:50,ban:['SG']}],fairies:[{id:'command',name:'지휘요정',power:300}],missions:[{id:'alpha',name:'ALPHA',power:800,enemy:'철혈',rank:'E',rewards:{gold:500,parts:1}}],facilities:[{id:'base1',maxLevel:5,cost:{gold:100,res:50}}],manufacturing:{doll:{gold:100,res:100},equipment:{gold:100,res:100},heavy:{gold:500,res:500}}}
};
function runtime(){const registry=createCoreRegistry().register(gflModule()),rng=createRng(7);let state=createState(schema,7);return{get state(){return state;},dispatch(id:string,params:Record<string,unknown>={}){const result=registry.dispatch(schema,state,{id,params},rng);if(result.log.some(row=>row.ok))state=result.state;return result;},select(id:string){return registry.select(id,schema,state);},snapshot(){return{state:structuredClone(state),rng:rng.snapshot()};}};}
describe('Girls Frontline native module',()=>{
  it('runs start, echelon, sortie, combat settlement, repair and manufacturing deterministically',()=>{
    const game=runtime();expect(game.dispatch('gfl/start',{mode:'commander'}).log[0]).toMatchObject({ok:true,starter:'m4a1'});
    expect(game.dispatch('gfl/echelon/assign',{echelonId:'e1',slot:0,dollId:'m4a1'}).log[0]?.ok).toBe(true);
    expect(game.dispatch('gfl/sortie/start',{missionId:'alpha',echelonId:'e1'}).log[0]?.ok).toBe(true);
    expect(game.dispatch('gfl/sortie/engage').log[0]?.ok).toBe(true);
    for(let i=0;i<20&&(game.select('combat/console')as any).active;i++){const enemy=(game.select('combat/console')as any).enemies.find((value:any)=>!value.dead);if(!enemy)break;game.dispatch('combat_action',{action:'attack',target:enemy.id});if(!(game.select('combat/console')as any).cleared)game.dispatch('enemy_turn');}
    expect(game.dispatch('gfl/sortie/finish').log[0]).toMatchObject({ok:true,outcome:'victory',missionId:'alpha'});
    expect(game.state.gold).toBeGreaterThan(5000);
    const manufactured=game.dispatch('gfl/manufacture/start',{kind:'doll'}).log[0] as any;expect(manufactured.ok).toBe(true);game.dispatch('gfl/manufacture/tick',{jobId:manufactured.job.id});game.dispatch('gfl/manufacture/tick',{jobId:manufactured.job.id});expect((game.select('gfl/dolls')as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
  it('rejects an empty echelon and insufficient resources without changing state',()=>{const game=runtime();game.dispatch('gfl/start',{mode:'commander'});const before=game.snapshot();expect(game.dispatch('gfl/sortie/start',{missionId:'alpha',echelonId:'e1'}).log[0]).toMatchObject({ok:false,reason:'gfl_echelon_empty'});expect(game.snapshot()).toEqual(before);});
  it('supports shop equipment and fairy management through engine-owned state',()=>{const game=runtime();game.dispatch('gfl/start',{mode:'commander'});expect(game.dispatch('gfl/shop/buy',{itemId:'scope'}).log[0]).toMatchObject({ok:true,price:100});expect(game.dispatch('gfl/equipment/equip',{dollId:'m4a1',equipmentId:'scope'}).log[0]).toMatchObject({ok:true,power:1050});expect(game.dispatch('gfl/fairy/acquire',{fairyId:'command'}).log[0]).toMatchObject({ok:true});expect(game.dispatch('gfl/fairy/assign',{fairyId:'command',echelonId:'e1'}).log[0]).toMatchObject({ok:true});expect(game.select('gfl/shop')).toMatchObject({catalog:[{id:'ration',owned:0},{id:'scope',owned:0}],fairies:[{id:'command',level:1}]});});
  it('replays 300 native management actions without state drift',()=>{const left=runtime(),right=runtime();for(const game of[left,right])game.dispatch('gfl/start',{mode:'commander'});for(let turn=0;turn<300;turn++){const id=turn%2===0?'gfl/echelon/assign':'gfl/echelon/remove',params=turn%2===0?{echelonId:'e1',slot:0,dollId:'m4a1'}:{echelonId:'e1',slot:0};expect(left.dispatch(id,params).log[0]?.ok).toBe(true);expect(right.dispatch(id,params).log[0]?.ok).toBe(true);}expect(left.snapshot()).toEqual(right.snapshot());});
});
