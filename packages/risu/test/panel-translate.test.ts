import{describe,expect,it}from'vitest';
import{composeTextTranslators,createPanelTranslator,translateYspTags}from'../src/index.ts';

const declarations=[{id:'status',kind:'panel' as const,fields:['이름','상태']},{id:'news',kind:'feed' as const,fields:['뉴스']}];

describe('panel translation',()=>{
  it('emits sync events, trims only values, and removes matched chains from prose',()=>{
    const result=createPanelTranslator(declarations)('도착했다.\n이름:  리안  | 상태: 경계 중 |\n| 뉴스:  항로 정상  |\n이야기가 계속된다.');
    expect(result.events).toEqual([{id:'panel_sync',params:{panelId:'status',fields:{이름:'리안',상태:'경계 중'}}},{id:'panel_sync',params:{panelId:'news',fields:{뉴스:'항로 정상'}}}]);
    expect(result.residue).toBe('도착했다.\n\n이야기가 계속된다.');
  });

  it('is a no-op for panel-free prose',()=>{
    const text='평범한 대화만 이어진다.';expect(createPanelTranslator(declarations)(text)).toEqual({events:[],residue:text});
  });

  it('composes sequential residue with existing tag translation and preserves both event channels',()=>{
    const translate=composeTextTranslators(translateYspTags,createPanelTranslator(declarations)),result=translate('정산 [ysp_gold::+12::보상]\n이름: 리안 | 상태: 휴식 |\n본문');
    expect(result.events.map(event=>event.id)).toEqual(['gold_delta','panel_sync']);
    expect(result.residue).toBe('정산 \n\n본문');
  });
});
