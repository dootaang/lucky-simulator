import{describe,expect,it}from'vitest';
import{createRng,ModuleRegistry,type RuntimeRecord}from'@simbot/kernel';
import{textPanelsModule}from'../src/index.ts';

const schema:RuntimeRecord={textPanels:[{id:'status',kind:'panel',fields:['이름','상태']},{id:'news',kind:'feed',fields:['뉴스']}],initialState:{}};

describe('text panels module',()=>{
  it('accepts declared string fields and exposes the selector view model',()=>{
    const registry=new ModuleRegistry().register(textPanelsModule()),result=registry.dispatch(schema,{}, {id:'panel_sync',params:{panelId:'status',fields:{이름:'리안',상태:'대기'}}},createRng(1));
    expect(result.log[0]).toMatchObject({ok:true,event:'panel_sync',panelId:'status',fields:{이름:'리안',상태:'대기'}});
    expect(registry.select('panels/all',schema,result.state)).toEqual([{id:'status',kind:'panel',fields:[{label:'이름',value:'리안'},{label:'상태',value:'대기'}],feed:[]},{id:'news',kind:'feed',fields:[{label:'뉴스',value:''}],feed:[]}]);
  });

  it('rejects undeclared panels, labels, and non-string values without creating state',()=>{
    const registry=new ModuleRegistry().register(textPanelsModule()),rng=createRng(2);
    for(const params of[{panelId:'missing',fields:{상태:'대기'}},{panelId:'status',fields:{미등록:'값'}},{panelId:'status',fields:{상태:3}}]){
      const result=registry.dispatch(schema,{}, {id:'panel_sync',params},rng);
      expect(result.log[0]?.ok).toBe(false);expect(result.state).toEqual({});
    }
  });

  it('keeps the five most recent feed strings verbatim',()=>{
    const registry=new ModuleRegistry().register(textPanelsModule()),rng=createRng(3);let state:RuntimeRecord={};
    for(let index=1;index<=7;index++)state=registry.dispatch(schema,state,{id:'panel_sync',params:{panelId:'news',fields:{뉴스:`  소식 ${index}  `}}},rng).state;
    expect((registry.select('panels/all',schema,state)as Array<Record<string,unknown>>)[1]).toMatchObject({fields:[{label:'뉴스',value:'  소식 7  '}],feed:['  소식 3  ','  소식 4  ','  소식 5  ','  소식 6  ','  소식 7  ']});
  });
});
