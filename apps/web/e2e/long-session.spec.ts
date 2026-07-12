import { expect, test } from '@playwright/test';

// 부팅 스모크 + 저장소 백엔드 확인.
// 옛 버전은 라우트 버튼('플레이어')과 데모 프로젝트를 전제로 했는데, 앱이 열면 바로 플레이어가 되고
// 카드가 없으면 채팅이 없는 구조로 바뀌면서 '통과한 적 없이' 죽어 있었다(60초 타임아웃). 현재 앱에 맞게 되살린다.
// 300턴 지속성·복원 자체는 packages/session 유닛 테스트가 지킨다. 여기서는 브라우저 환경 전제를 지킨다.

test('교차 출처 격리 + 저장소 백엔드가 살아서 부팅한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  // SQLite OPFS(SharedArrayBuffer)에 필요한 격리 헤더가 실제로 걸려 있는가.
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // 카드가 없어도 셸이 뜬다(임포트 화면이 첫 얼굴이면 안 된다 — 리스 문법).
  await expect(page.getByRole('button', { name: /카드 가져오기/ }).first()).toBeVisible({ timeout: 15_000 });

  // 저장소가 실제로 초기화됐는가(IndexedDB 또는 OPFS 중 하나는 반드시).
  await expect.poll(async () => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const files = await Array.fromAsync((await navigator.storage.getDirectory()).keys());
    return databases.length + files.length;
  }), { timeout: 15_000 }).toBeGreaterThan(0);

  expect(errors).toEqual([]); // 부팅 중 미처리 예외가 없어야 한다
});
