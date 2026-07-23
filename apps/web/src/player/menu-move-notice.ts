export const MENU_MOVE_NOTICE_KEY = 'lucky.ui.menu-move-notice.v1';
export const MENU_MOVE_NOTICE_FORCE_KEY = 'lucky.ui.menu-move-notice.force';
export function shouldShowMenuMoveNotice(storage: Pick<Storage, 'getItem'> = localStorage) { return storage.getItem(MENU_MOVE_NOTICE_KEY) !== 'dismissed'; }
export function dismissMenuMoveNotice(storage: Pick<Storage, 'setItem'> = localStorage) { storage.setItem(MENU_MOVE_NOTICE_KEY, 'dismissed'); }
export function resetMenuMoveNotice(storage: Pick<Storage, 'removeItem'> = localStorage) { storage.removeItem(MENU_MOVE_NOTICE_KEY); }
export function forceMenuMoveNotice(storage: Pick<Storage, 'setItem'> = sessionStorage) { storage.setItem(MENU_MOVE_NOTICE_FORCE_KEY, '1'); }
export function isMenuMoveNoticeForced(storage: Pick<Storage, 'getItem'> = sessionStorage) { return storage.getItem(MENU_MOVE_NOTICE_FORCE_KEY) === '1'; }
export function clearForcedMenuMoveNotice(storage: Pick<Storage, 'removeItem'> = sessionStorage) { storage.removeItem(MENU_MOVE_NOTICE_FORCE_KEY); }
