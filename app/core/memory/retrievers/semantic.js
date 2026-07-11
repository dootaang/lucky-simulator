'use strict';

// 의미(임베딩) 검색 — EmbeddingProvider로 문서·질의를 벡터화하고 코사인 유사도로 순위.
// provider는 교체 지점: fixed(결정론) ↔ voyage(실호출). 이 모듈은 provider에 불가지.
// HypaV3 고증: 요약을 조각(child)으로 나눠 임베딩하고 childToParentRRF로 부모(record)에 합산.

const { cosineSimilarity, childToParentRRF } = require('../ranking.js');

function splitChunks(text, separator = '\n') {
  return String(text == null ? '' : text)
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 인덱스 빌드 — 각 record를 조각으로 나눠 문서 그룹으로 임베딩(순서 보존).
async function buildSemanticIndex(records, provider, { separator = '\n' } = {}) {
  const groups = records.map((record) => {
    const chunks = splitChunks(record.text, separator);
    return chunks.length ? chunks : [String(record.text || '')];
  });
  const vectors = await provider.embedDocumentGroups(groups);
  const chunkRefs = [];
  records.forEach((record, ri) => {
    (vectors[ri] || []).forEach((vector, ci) => chunkRefs.push({ recordId: record.id, chunkIndex: ci, vector }));
  });
  return { records, chunkRefs, provider };
}

// 질의 벡터로 조각 순위 → childToParentRRF로 record 순위(HypaV3 방식).
async function semanticSearch(index, query, topK = 20) {
  const [qVec] = await index.provider.embedQueries([query]);
  const scoredChunks = index.chunkRefs.map((ref) => ({
    key: `${ref.recordId}#${ref.chunkIndex}`,
    recordId: ref.recordId,
    score: cosineSimilarity(qVec, ref.vector),
  }));
  const ranked = scoredChunks
    .filter((c) => c.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.key < b.key ? -1 : 1));
  const parentOrder = childToParentRRF(ranked.map((c) => c.key), (key) => key.split('#')[0]);
  // record별 대표 코사인(최댓값)도 보존해 hybrid 융합에 쓴다.
  const bestByRecord = new Map();
  for (const c of ranked) if (!bestByRecord.has(c.recordId) || c.score > bestByRecord.get(c.recordId)) bestByRecord.set(c.recordId, c.score);
  return parentOrder.slice(0, topK).map((recordId) => ({ recordId, score: bestByRecord.get(recordId) || 0 }));
}

module.exports = { buildSemanticIndex, semanticSearch, splitChunks };
