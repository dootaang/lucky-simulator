// SPDX-License-Identifier: GPL-3.0-or-later
// C1 — 임베딩 캐시(provider/model/dimension/context/text hash 키). 동일 입력 중복 제거·재호출 방지.
// 결정론: 순수 인메모리. 외부 저장·시간 의존 없음(만료는 호출자가 관리).
// 개념 참고: LIBRA World Manager 5.3.1의 embedding cache/queue 아이디어(코드 미복사, 재구현).
//   출처·해시는 docs/THIRD_PARTY_PROVENANCE.md.

// FNV-1a 32bit — 캐시 키 부품(보안용 아님).
export function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// 캐시 키용 강화 해시 — 서로 다른 시드의 FNV 두 개 + 길이로 ~64bit 유효폭.
// 32bit 단독은 대규모 코퍼스/장기 세션에서 충돌 시 엉뚱한 임베딩을 반환할 수 있다(감사 Minor).
function strongHash(text: string): string {
  let a = 2166136261;
  let b = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a ^= c; a = Math.imul(a, 16777619);
    b = Math.imul(b ^ c, 2654435761);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16)}`;
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
      return `${model}|${dimension}|${inputType}|${strongHash(contextId)}|${strongHash(text)}`;
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
