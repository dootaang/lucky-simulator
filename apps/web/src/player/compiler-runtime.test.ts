import {describe,expect,it} from 'vitest';
import type {ParsedCard} from '@simbot/card';
import {compileCard} from '@simbot/compiler';
import {cardToRuntimeProject} from '@simbot/risu';
import {ProjectRuntime} from '@simbot/runtime';

const parsed:ParsedCard={format:'charx',source:'inn.charx',spec:'chara_card_v3',specVersion:'3',name:'용사여관',card:{data:{name:'용사여관',description:'객실 숙박 체크인 체크아웃과 주점 영업'}},assets:[],containerEntries:[],sourceBytes:new Uint8Array([1]),modules:[]};
const modelSchema={meta:{id:'inn'},resources:{food:{unit:'인분',min:0,basePrice:3000},drink:{unit:'잔',min:0,basePrice:5000}},scales:[],ladders:[],entities:{facility:{instances:{lv_tavern:{label:'주점',maxLevel:4,upgradeCosts:{'2':1000}},lv_kitchen:{label:'주방',maxLevel:4},lv_room:{label:'객실',maxLevel:4},lv_quarter:{label:'직원 숙소',maxLevel:4}}},room:{instances:{'101':{kind:'single',pricePerNight:30000,capacity:1,requiresRoomLevel:1}}},menuItem:{instances:{egg:{name:'달걀',category:'food',price:5000}}}},events:[],initialState:{day:1,gold:100000,resources:{food:10,drink:10},facilities:{lv_tavern:1,lv_kitchen:1,lv_room:1,lv_quarter:1}}};

describe('compiled card runtime vertical slice',()=>{
  it('assembles an actionable inn screen instead of a schema-only artifact',async()=>{
    const compiled=await compileCard({parsed,provider:{async complete(){return{text:JSON.stringify(modelSchema),events:[]};}}}),profile=cardToRuntimeProject(parsed,compiled),runtime=new ProjectRuntime(profile.project,4);
    expect(profile.passport.mode).toBe('full-sim');
    expect(profile.project.screens).toEqual([expect.objectContaining({id:'management'})]);
    expect(runtime.registry.hasEvent('traffic_wave')).toBe(true);
    const result=runtime.dispatch('traffic_wave',{wave:'lunch'});
    expect(result.log[0]).toMatchObject({ok:true,event:'traffic_wave'});
  });
});
