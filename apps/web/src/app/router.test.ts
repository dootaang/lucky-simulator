import {describe,expect,it} from 'vitest'; import {createRouter} from './router.svelte.ts';
describe('router',()=>{
  // 앱을 열면 바로 플레이어다. 제작 편집기는 플레이어 안에서 열리므로 별도 경로가 없다.
  it('기본 진입은 플레이어이며 보조 화면 전환이 가능하다',()=>{const router=createRouter();expect(router.route).toBe('player');router.go('components');expect(router.route).toBe('components');router.go('home');expect(router.route).toBe('home');});
  it('초기 라우트를 지정할 수 있다',()=>{expect(createRouter('home').route).toBe('home');});
});
