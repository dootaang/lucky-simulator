import{describe,expect,it}from'vitest';
import{safeBackgroundSource}from'./background-render';

describe('safe Risu background rendering',()=>{
  const asset={name:'room.png',type:'background',ext:'png',mime:'image/png',size:1,bytes:new Uint8Array([1])};
  it('resolves asset macros and blocks executable or remote content',()=>{const html=safeBackgroundSource(`<script>alert(1)</script><div onclick="evil()" style="background:url(https://evil.test/a.png)">{{bg::room.png}}</div>`,[asset],()=> 'blob:room');expect(html).toContain('blob:room');expect(html).not.toContain('<script');expect(html).not.toContain('onclick');expect(html).not.toContain('https://evil.test');expect(html).toContain("default-src 'none'");});
});
