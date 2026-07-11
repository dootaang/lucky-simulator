'use strict';

// 랭킹·융합 유틸 — RisuAI HypaMemory V3에서 의미 재현(선별 이식).
// 출처: kwaroran/RisuAI (GPL-3.0), src/ts/process/memory/hypav3.ts
//   simpleCC / simpleRRF / childToParentRRF / normalizeScores (기준 commit 9d8791e).
//   상세·변경 내역은 docs/THIRD_PARTY_PROVENANCE.md.
// 우리 변경: 제네릭 T→문자열 id 키, Map 순회 순서 의존을 제거하고 동점은 id 사전순으로
//   안정 정렬해 결정론 재현을 보장(원본은 Map 삽입 순서에 암묵 의존).

// 가중 점수 결합(원본 simpleCC): 여러 [id, score] 목록을 리스트별 가중치로 합산.
function weightedScoreCombination(scoredLists, weightFn) {
  const scores = new Map();
  for (let listIndex = 0; listIndex < scoredLists.length; listIndex += 1) {
    const list = scoredLists[listIndex];
    const weight = weightFn ? weightFn(listIndex, scoredLists.length) : 1 / scoredLists.length;
    for (const [id, score] of list) scores.set(id, (scores.get(id) || 0) + score * weight);
  }
  return sortByScoreThenId(scores);
}

// Reciprocal Rank Fusion(원본 simpleRRF): 순위 목록들을 1/(k+rank)로 융합.
function reciprocalRankFusion(rankedLists, k = 60) {
  const scores = new Map();
  for (const list of rankedLists) {
    for (let i = 0; i < list.length; i += 1) {
      const id = list[i];
      scores.set(id, (scores.get(id) || 0) + 1 / (k + (i + 1)));
    }
  }
  return sortByScoreThenId(scores);
}

// 자식(요약 조각) 순위를 부모(요약)로 접어 RRF(원본 childToParentRRF).
function childToParentRRF(rankedChildren, parentOf, k = 60) {
  const scores = new Map();
  for (let i = 0; i < rankedChildren.length; i += 1) {
    const parent = parentOf(rankedChildren[i]);
    scores.set(parent, (scores.get(parent) || 0) + 1 / (k + (i + 1)));
  }
  return sortByScoreThenId(scores);
}

// 점수 정규화(원본 normalizeScores): min==max 분기까지 동일.
function normalizeScores(scoredList) {
  if (!scoredList.length) return [];
  const values = scoredList.map(([, score]) => score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return scoredList.map(([id]) => [id, min === 0 ? 0 : 1]);
  return scoredList.map(([id, score]) => [id, (score - min) / (max - min)]);
}

// 결정론 정렬 — 점수 내림차순, 동점은 id 사전순(원본의 Map 순서 의존 제거).
function sortByScoreThenId(scoresMap) {
  return Array.from(scoresMap.entries())
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { weightedScoreCombination, reciprocalRankFusion, childToParentRRF, normalizeScores, cosineSimilarity };
