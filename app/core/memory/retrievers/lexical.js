'use strict';

// 어휘(키워드/FTS 대역) 검색 — 외부 의존 없는 in-memory 역색인.
// SQLite FTS5가 아직 없어도 인터페이스를 먼저 검증한다(CLAUDE-TASK Phase B-B).
// 결정론: 같은 코퍼스·질의면 같은 순위(동점은 recordId 사전순).

function tokenize(text) {
  return String(text == null ? '' : text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length >= 1);
}

// 한국어는 공백 토큰이 커서 부분 매칭이 약하다 — 문자 2-gram을 함께 색인해 보완.
function terms(text) {
  const words = tokenize(text);
  const grams = [];
  const joined = words.join(' ');
  for (let i = 0; i < joined.length - 1; i += 1) {
    const g = joined.slice(i, i + 2);
    if (g.trim().length === 2) grams.push(`#${g}`);
  }
  return words.concat(grams);
}

function buildLexicalIndex(records) {
  const docs = records.map((record) => ({ record, terms: terms(record.text) }));
  const df = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc.terms)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = docs.length || 1;
  return { docs, df, N };
}

// BM25-lite 점수 — idf 가중 term frequency. 결정론.
function lexicalSearch(index, query, topK = 20) {
  const qTerms = terms(query);
  const qset = new Set(qTerms);
  const scored = index.docs.map(({ record, terms: docTerms }) => {
    const tf = new Map();
    for (const t of docTerms) if (qset.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const [term, freq] of tf) {
      const idf = Math.log(1 + (index.N / (1 + (index.df.get(term) || 0))));
      score += idf * (freq / (freq + 1.5));
    }
    return { recordId: record.id, score, record };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.recordId < b.recordId ? -1 : 1))
    .slice(0, topK);
}

module.exports = { buildLexicalIndex, lexicalSearch, terms };
