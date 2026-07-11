'use strict';

// 고정(결정론) 임베딩 provider — 외부 API 호출 없음. CI·재현 벤치마크의 기준선.
// EmbeddingProvider 계약(../contracts.ts)의 구현. Voyage provider가 같은 계약으로 대체된다.
//
// 방식: 문자 3-gram의 해시 버킷 카운트 → L2 정규화 벡터. 실제 의미 임베딩은 아니지만
//   ① 완전 결정론(같은 텍스트 = 같은 벡터) ② 어휘가 겹치는 바꿔 말하기에 부분 신호를 줘
//   검색 파이프라인·지표 계산을 외부 비용 없이 검증할 수 있다. 절대 품질이 아니라
//   "harness가 올바른가"를 재는 도구다(실 의미 품질은 --live-voyage에서 측정).

const DEFAULT_DIM = 256;

function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeText(text) {
  return String(text == null ? '' : text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function embedOne(text, dimension) {
  const vec = new Array(dimension).fill(0);
  const norm = normalizeText(text);
  if (!norm) return vec;
  const grams = [];
  const padded = ` ${norm} `;
  for (let i = 0; i < padded.length - 2; i += 1) grams.push(padded.slice(i, i + 3));
  for (const gram of grams) {
    const h = fnv1a(gram);
    const bucket = h % dimension;
    const sign = (h & 0x100) ? 1 : -1; // 부호 해싱 — 상쇄로 변별력 확보
    vec[bucket] += sign;
  }
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag);
  if (mag === 0) return vec;
  for (let i = 0; i < dimension; i += 1) vec[i] /= mag;
  return vec;
}

function createFixedEmbeddingProvider({ dimension = DEFAULT_DIM } = {}) {
  const dim = Math.max(16, Math.trunc(Number(dimension) || DEFAULT_DIM));
  return {
    modelId: `fixed-hashgram-${dim}`,
    dimension: dim,
    async embedDocumentGroups(groups) {
      return groups.map((chunks) => chunks.map((chunk) => embedOne(chunk, dim)));
    },
    async embedQueries(queries) {
      return queries.map((query) => embedOne(query, dim));
    },
  };
}

module.exports = { createFixedEmbeddingProvider, embedOne };
