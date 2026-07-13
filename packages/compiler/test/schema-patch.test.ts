import { describe, expect, it } from 'vitest';
import type { ParsedCard, ParsedModule } from '@simbot/card';
import { mineCard, patchSchemaWithMined } from '../src/index.ts';

const lua=`
local rankThresholds = { 100, 300, 800 }
local roomMaxCap = { ["101"] = 4, ["102"] = 2 }
local roomReqsAuto = { ["101"] = 1, ["102"] = 2, ["103"] = 3 }
local captiveMaxByStorage = { ["1"] = 2, ["2"] = 5 }
local roomData = { mystery = 77 }
local reward = 15
`;
const module:ParsedModule={name:'용사여관 규칙',regex:[],lorebook:[],defaultVariables:{},raw:{trigger:[{effect:[{code:lua}]}]}};
const card:ParsedCard={format:'charx',source:'yongsa.charx',spec:'chara_card_v3',specVersion:'3',name:'용사여관',card:{spec:'chara_card_v3',data:{name:'용사여관'}},assets:[],containerEntries:[],sourceBytes:new Uint8Array([1]),modules:[module]};

describe('shape-based mined schema patching',()=>{
  it('connects inn thresholds, capacities, requirements and scalars while reporting ambiguity',()=>{
    const schema={ladders:[{id:'reputation',thresholds:[1,2,3]}],staffing:{capacityByLevel:{'1':1,'2':1}},entities:[{type:'room',instances:[{no:'101',capacity:1,requiresRoomLevel:9},{no:'102',capacity:1,requiresRoomLevel:9},{no:'103',capacity:null,requiresRoomLevel:9}]}],traffic:{reward:1}};
    const result=patchSchemaWithMined(schema,mineCard(card));
    expect(result.schema).toMatchObject({ladders:[{thresholds:[100,300,800]}],entities:[{instances:[{capacity:4,requiresRoomLevel:1},{capacity:2,requiresRoomLevel:2},{capacity:null,requiresRoomLevel:3}]}],traffic:{reward:15}});
    expect(result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({path:'ladders[0].thresholds',from:[1,2,3],to:[100,300,800],source:'rankThresholds'}),
      expect.objectContaining({path:'room(101).capacity',from:1,to:4,source:'roomMaxCap'}),
      expect.objectContaining({path:'room(103).requiresRoomLevel',from:9,to:3,source:'roomReqsAuto'}),
      expect.objectContaining({path:'staffing.capacityByLevel',from:{'1':1,'2':1},to:{'1':2,'2':5},source:'captiveMaxByStorage'}),
      expect.objectContaining({path:'traffic.reward',from:1,to:15,source:'constants.reward'}),
    ]));
    expect(result.unmatchedMinedValues).toEqual(expect.arrayContaining([expect.objectContaining({path:'tables.roomData',source:'roomData'})]));
  });
});
