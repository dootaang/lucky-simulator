import { describe, expect, it } from 'vitest';
import { clearForcedMenuMoveNotice, dismissMenuMoveNotice, forceMenuMoveNotice, isMenuMoveNoticeForced, MENU_MOVE_NOTICE_KEY, resetMenuMoveNotice, shouldShowMenuMoveNotice } from './menu-move-notice';

describe('menu move notice', () => {
  it('shows once, stays dismissed, and can be restored from help', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(shouldShowMenuMoveNotice(storage)).toBe(true);
    dismissMenuMoveNotice(storage); expect(values.get(MENU_MOVE_NOTICE_KEY)).toBe('dismissed'); expect(shouldShowMenuMoveNotice(storage)).toBe(false);
    resetMenuMoveNotice(storage); expect(shouldShowMenuMoveNotice(storage)).toBe(true);
    forceMenuMoveNotice(storage); expect(isMenuMoveNoticeForced(storage)).toBe(true);
    clearForcedMenuMoveNotice(storage); expect(isMenuMoveNoticeForced(storage)).toBe(false);
  });
});
