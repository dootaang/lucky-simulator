import{describe,expect,it}from'vitest';
import{extractGflBackgroundCue,prepareGflNarrative}from'./gfl-presentation.ts';
describe('GFL native narrative presentation',()=>{
  it('converts dialogue frames and silently removes engine-owned UI proposals',()=>{const result=prepareGflNarrative('[|<img="M1918_joy">|"반가워요."|]\n[[aff=M1918=5]][[mood=M1918=25]][상태창][사이드패널][하단상태창]');expect(result).toContain('{{img::M1918_joy}}');expect(result).toContain('> 반가워요.');expect(result).not.toContain('aff=');expect(result).not.toContain('상태창');});
  it('removes original log, time and background tags while retaining prose and BGM cue',()=>{const source='아침이 밝았다.\n[[log1=새 하루를 시작했다.]]\n|day3_오전\n[배경:BG_지휘관실_오전오후]\n[진행도상태] |BGM_daily|';const result=prepareGflNarrative(source);expect(result).toContain('아침이 밝았다.');expect(result).toContain('|BGM_daily|');expect(result).not.toContain('log1');expect(result).not.toContain('배경:');expect(extractGflBackgroundCue(source)).toBe('BG_지휘관실_오전오후');});
});
