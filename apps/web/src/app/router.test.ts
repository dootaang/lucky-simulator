import {describe,expect,it} from 'vitest'; import {createRouter} from './router.svelte.ts';
describe('router',()=>{
  // 앱을 열면 바로 플레이어다(리스와 동일한 첫인상). 홈·편집기는 제작자 경로.
  it('기본 진입은 플레이어이며 모드 전환이 런타임을 바꾸지 않는다',()=>{const router=createRouter();expect(router.route).toBe('player');router.go('editor');expect(router.route).toBe('editor');router.go('home');expect(router.route).toBe('home');});
  it('초기 라우트를 지정할 수 있다',()=>{expect(createRouter('home').route).toBe('home');});
});
