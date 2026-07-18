import{describe,expect,it,vi}from'vitest';
vi.mock('@simbot/ui/sanitize-html',()=>({sanitizeHtml:(source:string)=>source}));
import{extractGflBackgroundCue,prepareGflNarrative}from'./gfl-presentation.ts';
import{renderDisplayContent}from'./display-macros.ts';
describe('GFL native narrative presentation',()=>{
  it('converts dialogue frames to the Risu img CBS and silently removes engine-owned UI proposals',()=>{const result=prepareGflNarrative('[|<img="M1918_joy">|"반가워요."|]\n[[aff=M1918=5]][[mood=M1918=25]][상태창][사이드패널][하단상태창]');expect(result).toContain('{{img::M1918_joy}}');expect(result).toContain('> 반가워요.');expect(result).not.toContain('aff=');expect(result).not.toContain('상태창');});
  it('renders the exact lowercase FAMAS frame through the real chat renderer instead of exposing its tag',()=>{const source='[|<img="famas_normal">|"제 정식 명칭은 FAMAS입니다."|]\n[|<img="famas_smile">|"더 궁금한 점이 있으신가요?"|]',assets=[{name:'FAMAS_normal',type:'emotion',mime:'image/png',bytes:new Uint8Array([1])},{name:'FAMAS_smile',type:'emotion',mime:'image/png',bytes:new Uint8Array([2])}],result=renderDisplayContent(prepareGflNarrative(source),'지휘관','소녀전선',assets);expect(result.html.match(/<img /g)).toHaveLength(2);expect(result.html).not.toContain('famas_normal">|');expect(result.html).not.toContain('{{img');expect(result.warnings).toEqual([]);});
  it('removes original log, time and background tags while retaining prose and BGM cue',()=>{const source='아침이 밝았다.\n[[log1=새 하루를 시작했다.]]\n|day3_오전\n[배경:BG_지휘관실_오전오후]\n[진행도상태] |BGM_daily|';const result=prepareGflNarrative(source);expect(result).toContain('아침이 밝았다.');expect(result).toContain('|BGM_daily|');expect(result).not.toContain('log1');expect(result).not.toContain('배경:');expect(extractGflBackgroundCue(source)).toBe('BG_지휘관실_오전오후');});
});
