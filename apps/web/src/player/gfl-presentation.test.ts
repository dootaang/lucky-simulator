import{describe,expect,it}from'vitest';
import{prepareGflNarrative}from'./gfl-presentation.ts';
describe('GFL native narrative presentation',()=>{it('converts dialogue frames and explains rejected state proposals',()=>{const result=prepareGflNarrative('[|<img="M1918_joy">|"반가워요."|]\n[[aff=M1918=5]][[mood=M1918=25]][상태창][사이드패널][하단상태창]');expect(result).toContain('{{img::M1918_joy}}');expect(result).toContain('> 반가워요.');expect(result).not.toContain('aff=');expect(result).not.toContain('상태창');expect(result).toContain('엔진 판정값');});});
