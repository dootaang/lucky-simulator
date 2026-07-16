import { expect, test, type Page } from '@playwright/test';

// 새니타이저는 DOMParser(브라우저 API)에 의존하므로 반드시 실제 브라우저에서 검증한다.
// 카드가 뱉는 HTML을 화면에 그리는 이상, 여기가 우리 앱의 XSS 최전선이다.
// (이 스펙은 한때 프리뷰 서버에 원본 .ts를 import하려다 모듈 로드부터 실패해 '통과한 적 없이' 죽어 있었다.
//  그래서 playwright.config를 dev 서버로 바꿔 소스 모듈을 실제로 불러 검증한다.)

const SANITIZER = '/@fs/C:/freetalk/simbot-simulator/packages/ui/src/sanitize-html.ts';

async function sanitize(page: Page, html: string): Promise<string> {
  return page.evaluate(async ([modulePath, source]) => {
    const module = await import(/* @vite-ignore */ modulePath as string) as { sanitizeHtml(value: string): string };
    return module.sanitizeHtml(source as string);
  }, [SANITIZER, html]);
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('활성 HTML을 무력화한다 — 스크립트·이벤트 핸들러·위험 URL', async ({ page }) => {
  const out = await sanitize(page, [
    '<script>alert(1)</script>',
    '<iframe src="https://evil.test"></iframe>',
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
    '<svg onload="alert(1)"></svg>',
    '<object data="evil.swf"></object><embed src="evil.swf">',
    '<form action="/steal"><input name="pw"></form>',
    '<div style="background:url(javascript:alert(1))">styled</div>',
    '<a href="vbscript:msgbox(1)">vb</a>',
  ].join(''));

  expect(out).not.toContain('<script');
  expect(out).not.toContain('<iframe');
  expect(out).not.toContain('<svg');
  expect(out).not.toContain('<object');
  expect(out).not.toContain('<embed');
  expect(out).not.toContain('<form');
  expect(out).not.toContain('<input');
  expect(out).not.toMatch(/on(error|load|click)=/i);
  expect(out).not.toContain('javascript:');
  expect(out).not.toContain('vbscript:');
  expect(out).not.toContain('style=');
});

// 안전 CSS 부분집합 (오너 승인 2026-07-16): 표현용 인라인 스타일은 살리되, 실행·네트워크 축이 보이면
// 속성값 전체를 버리고 외부 url()·fixed/sticky는 중화한다. 위 테스트의 url(javascript:) 케이스가
// '전체 폐기' 경로의 회귀이고, 여기는 '살아남는 것'과 '중화되는 것'의 경계를 고정한다.
test('표현용 인라인 스타일은 살아남고 위험 축만 중화된다', async ({ page }) => {
  const out = await sanitize(page, '<p style="color:#ebc228; font-size:30px"><b>제목</b></p><div style="position:fixed; background:url(https://evil.test/x.png); border:1px solid gold">카드</div>');
  expect(out).toContain('style="color:#ebc228; font-size:30px"'); // 표현 CSS는 보존
  expect(out).toContain('position:relative');                      // fixed는 중화
  expect(out).not.toContain('position:fixed');
  expect(out).not.toContain('evil.test');                          // 외부 url은 네트워크 유출이라 중화
  expect(out).toContain('border:1px solid gold');
});

test('data:text/html 이미지는 차단한다', async ({ page }) => {
  const out = await sanitize(page, '<img src="data:text/html,hello">');
  expect(out).not.toContain('data:text/html');
});

test('카드가 그리는 이미지 마크업은 살아남는다', async ({ page }) => {
  const out = await sanitize(page, '<div class="rp-image-wrap"><img class="rp-image-card" src="data:image/png;base64,AQID" alt="standing"></div>');
  expect(out).toContain('class="rp-image-wrap"');
  expect(out).toContain('class="rp-image-card"');
  expect(out).toContain('src="data:image/png;base64,AQID"');
  expect(out).toContain('alt="standing"');
});

test('blob: 이미지(카드 에셋)와 안전한 링크는 허용하고 링크는 새 탭으로 강제한다', async ({ page }) => {
  const out = await sanitize(page, '<img src="blob:https://lucky-sim.web.app/abc"><a href="https://example.com" title="ok">safe</a>');
  expect(out).toContain('src="blob:https://lucky-sim.web.app/abc"');
  expect(out).toContain('href="https://example.com"');
  expect(out).toContain('target="_blank"');
  expect(out).toContain('rel="noreferrer noopener"');
});

test('결정적 증명 — 새니타이즈 결과를 실제 DOM에 붙여도 스크립트가 실행되지 않는다', async ({ page }) => {
  const fired = await page.evaluate(async (modulePath) => {
    const module = await import(/* @vite-ignore */ modulePath as string) as { sanitizeHtml(value: string): string };
    const flagged = window as unknown as { __xss?: boolean };
    flagged.__xss = false;
    const payload = '<img src=x onerror="window.__xss=true"><svg onload="window.__xss=true"></svg><scr' + 'ipt>window.__xss=true</scr' + 'ipt>';
    const host = document.createElement('div');
    host.innerHTML = module.sanitizeHtml(payload);
    document.body.appendChild(host);
    await new Promise((resolve) => setTimeout(resolve, 300)); // onerror/onload가 발화할 시간을 준다
    return flagged.__xss === true;
  }, SANITIZER);
  expect(fired).toBe(false);
});

// 오너가 겪은 증상의 직접 회귀: 카드가 뱉는 HTML이 글자로 보이면 안 되고 실제 이미지로 렌더돼야 한다.
// 전체 파이프라인(마크다운(HTML 보존) → 새니타이즈)을 통과시켜 <img>가 살아나오는지 본다.
test('카드 HTML이 이스케이프되지 않고 실제 이미지로 렌더된다', async ({ page }) => {
  const html = await page.evaluate(async () => {
    const markdown = await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/markdown.ts') as { renderMarkdownWithHtml(v: string): string };
    const sanitizer = await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/sanitize-html.ts') as { sanitizeHtml(v: string): string };
    const card = '<div class="rp-image-wrap"><img src="data:image/png;base64,AQID" class="rp-image-card"></div>';
    const out = sanitizer.sanitizeHtml(markdown.renderMarkdownWithHtml(card));
    const host = document.createElement('div');
    host.innerHTML = out;
    document.body.appendChild(host);
    return { out, images: host.querySelectorAll('img').length };
  });
  expect(html.images).toBe(1);            // 진짜 <img> 노드로 살아있다
  expect(html.out).not.toContain('&lt;'); // 이스케이프되어 글자로 남지 않았다
  expect(html.out).toContain('rp-image-card');
});

// 오너 실플레이 회귀: 모델이 매크로 없이 <img src="YSP_default">를 쓰면 예전엔 상대경로 404 →
// 깨진 이미지 아이콘이 떴다. 이제 에셋 이름이 data URL로 해석돼 진짜 이미지가 나와야 한다.
test('모델이 매크로 없이 쓴 에셋 이름 이미지도 렌더된다', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const risu = await import('/@fs/C:/freetalk/simbot-simulator/packages/risu/src/asset-macros.ts') as {
      resolveAssetMacros(v: string, a: readonly { name: string; type: string; mime: string; bytes: Uint8Array | null }[]): { content: string };
    };
    const markdown = await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/markdown.ts') as { renderMarkdownWithHtml(v: string): string };
    const sanitizer = await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/sanitize-html.ts') as { sanitizeHtml(v: string): string };
    const assets = [{ name: 'YSP_default', type: 'image', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }];
    const model = '<div class="rp-image-wrap"><img src="YSP_default" class="rp-image-card"></div>\n\n*"……마도사, S급."*';
    const out = sanitizer.sanitizeHtml(markdown.renderMarkdownWithHtml(risu.resolveAssetMacros(model, assets).content));
    const host = document.createElement('div');
    host.innerHTML = out;
    const img = host.querySelector('img');
    return { src: img?.getAttribute('src') ?? '', relative: out.includes('src="YSP_default"') };
  });
  expect(result.src.startsWith('data:image/png;base64,')).toBe(true); // 진짜 이미지로 해석됨
  expect(result.relative).toBe(false);                                 // 상대경로가 남지 않음(404·깨진 아이콘 방지)
});

test('감정 명령이 현재 의상 AVIF로 해석된 뒤에도 이미지로 남는다',async({page})=>{
  const result=await page.evaluate(async()=>{
    const risu=await import('/@fs/C:/freetalk/simbot-simulator/packages/risu/src/asset-macros.ts')as{resolveAssetMacros(v:string,a:readonly{name:string;type:string;mime:string;bytes:Uint8Array|null}[],o:{outfits:Record<string,number>}):{content:string}};
    const markdown=await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/markdown.ts')as{renderMarkdownWithHtml(v:string):string};
    const sanitizer=await import('/@fs/C:/freetalk/simbot-simulator/packages/ui/src/sanitize-html.ts')as{sanitizeHtml(v:string):string};
    const assets=[{name:'silvia_default_0',type:'emotion',mime:'image/avif',bytes:new Uint8Array([1])},{name:'silvia_default_2',type:'emotion',mime:'image/avif',bytes:new Uint8Array([2])}],resolved=risu.resolveAssetMacros('<img src="silvia_default">',assets,{outfits:{silvia:2}}),out=sanitizer.sanitizeHtml(markdown.renderMarkdownWithHtml(resolved.content)),host=document.createElement('div');host.innerHTML=out;return{count:host.querySelectorAll('img').length,src:host.querySelector('img')?.getAttribute('src')??'',raw:out.includes('silvia_default')};
  });
  expect(result).toEqual({count:1,src:'data:image/avif;base64,Ag==',raw:false});
});
