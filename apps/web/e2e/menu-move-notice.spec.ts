import { expect, test } from '@playwright/test';

test('이동한 설정·관리 메뉴를 한 번 안내하고 문제 해결에서 다시 볼 수 있다', async ({ page }) => {
  await page.goto('/');
  const notice = page.getByRole('status', { name: '메뉴 이동 안내' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: '확인' }).click();
  await page.reload();
  await expect(notice).toBeHidden();

  await page.getByRole('button', { name: '전체 설정' }).click();
  const settings = page.getByRole('dialog', { name: '전체 설정' });
  await settings.getByRole('button', { name: '문제 해결' }).click();
  await settings.getByRole('button', { name: '메뉴 이동 안내 다시 보기' }).click();
  await expect(notice).toBeVisible();
});
