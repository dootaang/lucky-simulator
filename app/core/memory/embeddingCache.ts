// SPDX-License-Identifier: GPL-3.0-or-later
// C1 — 임베딩 캐시(provider/model/dimension/context/text hash 키). 동일 입력 중복 제거·재호출 방지.
// 결정론: 순수 인메모리. 외부 저장·시간 의존 없음(만료는 호출자가 관리).
// 개념 참고: LIBRA World Manager 5.3.1의 embedding cache/queue 아이디어(코드 미복사, 재구현).
//   출처·해시는 docs/THIRD_PARTY_PROVENANCE.md.

// FNV-1a 32bit — 캐시 키용(충돌 무시 가능한 저비용 해시, 보안용 아님).
export function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
}

export interface EmbeddingCache {
  key(model: string, dimension: number, inputType: string, contextId: string, text: string): string;
  get(key: string): number[] | undefined;
  set(key: string, vector: number[]): void;
  stats(): CacheStats;
}

export function createEmbeddingCache(): EmbeddingCache {
  const store = new Map<string, number[]>();
  let hits = 0;
  let misses = 0;
  return {
    // contextId: 같은 문서 그룹(요약/에피소드)의 조각들이 공유하는 문맥 식별자 —
    // 같은 텍스트라도 다른 문맥에서 임베딩이 달라질 수 있으므로 키에 포함(contextual embedding).
    key(model, dimension, inputType, contextId, text) {
      return `${model}|${dimension}|${inputType}|${fnv1a(contextId)}|${fnv1a(text)}`;
    },
    get(k) {
      const v = store.get(k);
      if (v === undefined) { misses += 1; return undefined; }
      hits += 1;
      return v.slice();
    },
    set(k, vector) {
      store.set(k, vector.slice());
    },
    stats() {
      return { size: store.size, hits, misses };
    },
  };
}
