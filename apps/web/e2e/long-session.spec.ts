import { expect,test } from '@playwright/test';

test('starts isolated, persists a chat turn, and restores it after reload',async({page})=>{
  await page.goto('/');
  expect(await page.evaluate(()=>crossOriginIsolated)).toBe(true);
  await page.getByRole('button',{name:'플레이어'}).click();
  await expect(page.getByRole('heading',{name:'플레이'})).toBeVisible();
  await page.waitForTimeout(1_000);
  const input=page.getByRole('textbox',{name:'행동이나 대사를 입력하세요'});
  await input.fill('브라우저 복구 시험');
  await page.getByRole('button',{name:'전송'}).click();
  await expect(page.getByText('브라우저 복구 시험')).toBeVisible();
  await expect(page.getByText('LLM 설정에서 API 키와 모델을 입력하면 실제 대화를 시작할 수 있습니다.')).toBeVisible();
  const storage=await page.evaluate(async()=>({databases:await indexedDB.databases(),files:await Array.fromAsync((await navigator.storage.getDirectory()).keys())}));
  expect(storage.databases.length+storage.files.length).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('button',{name:'플레이어'}).click();
  await expect(page.getByText('브라우저 복구 시험')).toBeVisible({timeout:15_000});
});
