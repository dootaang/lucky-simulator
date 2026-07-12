import { describe, expect, it } from 'vitest';
import { classifyWidgetValue } from './widget-model.ts';

describe('structured widget model',()=>{
  it('classifies a pool as a clamped gauge',()=>{
    expect(classifyWidgetValue({cur:150,max:100},'HP')).toEqual({kind:'gauge',label:'HP',cur:150,max:100,percentage:100});
    expect(classifyWidgetValue({cur:-5,max:100},'HP')).toMatchObject({percentage:0});
  });
  it('classifies a flat scalar object as a stat strip',()=>{
    expect(classifyWidgetValue({gold:12,day:3})).toEqual({kind:'stat-strip',entries:[{key:'gold',value:'12'},{key:'day',value:'3'}]});
  });
  it('routes unknown detail data to structured key/value entries',()=>{
    expect(classifyWidgetValue({facilities:{kitchen:2},staff:['aria']})).toEqual({kind:'structured',entries:[{key:'facilities',value:'kitchen: 2'},{key:'staff',value:'aria'}]});
  });
});
