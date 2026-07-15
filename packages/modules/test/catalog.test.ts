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
});
