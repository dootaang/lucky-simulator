import { describe, expect, it } from 'vitest';
import { extractGflBgmCue, GFL_BGM_TRACKS, gflBgmTrack, latestGflBgmCue, stripGflBgmMarkers } from './gfl-bgm';

describe('Girls Frontline BGM compatibility', () => {
  it('keeps the full old-creator playlist without accepting arbitrary video ids', () => {
    expect(GFL_BGM_TRACKS).toHaveLength(30);
    expect(gflBgmTrack('BGM_day')?.youtubeId).toBe('92Eyg6ntieA');
    expect(gflBgmTrack('anything')).toBeNull();
  });

  it('reads both the old metadata header and the later standalone cue', () => {
    expect(extractGflBgmCue('BG_지휘관실|day1_오전|대기|N|N|N|BGM_day|\n본문')).toBe('day');
    expect(extractGflBgmCue('본문\n|BGM_daily|')).toBe('daily');
    expect(extractGflBgmCue('|BGM_bgmoff|')).toBe('bgmoff');
  });

  it('continues the last assistant track while the commander is typing', () => {
    expect(latestGflBgmCue([
      { role: 'assistant', content: '장면\n|BGM_cafe|' },
      { role: 'user', content: '카리나에게 말을 건다.' }
    ])).toBe('cafe');
  });

  it('hides machine-only music markers from the visible story', () => {
    const visible = stripGflBgmMarkers('==@\nBG_상점|day1_오후|N|N|N|N|BGM_shop|\n///\n카리나가 웃었다.\n|BGM_shop| ///');
    expect(visible).toBe('카리나가 웃었다.');
  });
});
