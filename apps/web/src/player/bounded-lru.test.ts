import{describe,expect,it,vi}from'vitest';
import{BoundedLru}from'./bounded-lru';

describe('BoundedLru',()=>{
  it('최근 사용한 항목은 남기고 가장 오래 안 쓴 항목만 정리한다',()=>{const evict=vi.fn(),cache=new BoundedLru<number>(2,evict);cache.set('a',1);cache.set('b',2);expect(cache.get('a')).toBe(1);cache.set('c',3);expect(cache.peek('a')).toBe(1);expect(cache.peek('b')).toBeUndefined();expect(cache.peek('c')).toBe(3);expect(evict).toHaveBeenCalledWith(2,'b');});
  it('교체·삭제·전체 정리 때 자원 해제 콜백을 정확히 한 번 부른다',()=>{const evict=vi.fn(),cache=new BoundedLru<object>(2,evict),first={},second={};cache.set('a',first);cache.set('a',second);cache.delete('a');cache.set('b',first);cache.clear();expect(evict.mock.calls).toEqual([[first,'a'],[second,'a'],[first,'b']]);});
});
