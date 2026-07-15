import { describe, expect, it } from 'vitest';
import { screenPresetsFor } from '../src/index.ts';

describe('module-owned screen presets', () => {
  it('keeps the genre.inn compiler preset deeply equal to the legacy screensFor output', () => {
    expect(screenPresetsFor(['genre.inn'])).toEqual({
      screens: [{ id:'management', title:'여관 경영', layout:'dashboard', regions:{ main:[{ widget:'inn-management' }] } }],
      navigation: [{ id:'management', screenId:'management', label:'여관 경영' }],
    });
  });

  it('provides the three declarative hunter journey screens and navigation items', () => {
    const presets=screenPresetsFor(['genre.hunter']);
    expect(presets.screens.map((screen)=>screen.id)).toEqual(['hunter-hq','hunter-gates','hunter-party']);
    expect(presets.navigation).toEqual([
      {id:'hunter-hq',screenId:'hunter-hq',label:'헌터 협회'},
      {id:'hunter-gates',screenId:'hunter-gates',label:'게이트'},
      {id:'hunter-party',screenId:'hunter-party',label:'파티'},
    ]);
    expect(JSON.stringify(presets.screens)).not.toContain('combat-console');
  });

  it('ignores schema for existing presets and adds one declared text-panel screen',()=>{
    expect(screenPresetsFor(['genre.inn'],{textPanels:[{id:'ignored',kind:'panel',fields:['값']}]})).toEqual(screenPresetsFor(['genre.inn']));
    const presets=screenPresetsFor(['sim.text-panels'],{textPanels:[{id:'status',kind:'panel',fields:['이름'],source:'상태'},{id:'news',kind:'feed',fields:['뉴스'],source:'소식'}]});
    expect(presets.screens).toEqual([{id:'text-panels',title:'상태창',layout:'dashboard',regions:{main:[{widget:'detail-panel',title:'상태',source:'state.panels.status.fields'},{widget:'detail-panel',title:'소식',source:'state.panels.news'}]}}]);
    expect(presets.navigation).toEqual([{id:'text-panels',screenId:'text-panels',label:'상태창'}]);
  });
});
