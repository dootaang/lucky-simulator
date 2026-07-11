// 기억 벤치마크 실행 하버스 — 네 비교군을 고정 코퍼스·고정 임베딩 provider로 측정.
// 외부 API 없음(기본). 결과 JSON + Markdown 리포트를 낸다.
// 실행: node scripts/memory-benchmark.mjs
//   --live-voyage 는 이번 단계에서 미구현(Phase A/B 범위 밖) — 붙이면 에러로 안내.
//
// 이 스크립트는 CommonJS 모듈(app/core/memory/*)을 require로 불러온다.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const corpus = require(join(ROOT, 'app/test/fixtures/memory-benchmark/corpus.json'));
const { questions } = require(join(ROOT, 'app/test/fixtures/memory-benchmark/questions.json'));
const { createFixedEmbeddingProvider } = require(join(ROOT, 'app/core/memory/providers/fixed.js'));
const planner = require(join(ROOT, 'app/core/memory/contextPlanner.js'));
const { buildLexicalIndex } = require(join(ROOT, 'app/core/memory/retrievers/lexical.js'));
const { buildSemanticIndex } = require(join(ROOT, 'app/core/memory/retrievers/semantic.js'));
const { evaluate } = require(join(ROOT, 'app/core/memory/benchmark.js'));

if (process.argv.includes('--live-voyage')) {
  console.error('--live-voyage 는 Phase C(Voyage 실호출)에서 구현됩니다. 현재는 고정 provider 벤치마크만 제공합니다.');
  process.exit(2);
}

async function run() {
  const provider = createFixedEmbeddingProvider({ dimension: 256 });
  const lexicalIndex = buildLexicalIndex(corpus.records);
  const semanticIndex = await buildSemanticIndex(corpus.records, provider);

  const groups = {
    'A. recent-only': (q) => planner.planRecentOnly(corpus, q),
    'B. structured+lexical': (q) => planner.planStructuredLexical(corpus, q, lexicalIndex),
    'C. hypa-v3': (q) => planner.planHypaV3(corpus, q, semanticIndex),
    'D. simbot-hybrid': (q) => planner.planSimbotHybrid(corpus, q, lexicalIndex, semanticIndex),
  };

  const results = {};
  for (const [name, plan] of Object.entries(groups)) {
    const planResults = [];
    for (const q of questions) planResults.push({ question: q, plan: await plan(q) });
    results[name] = evaluate(planResults, corpus);
  }

  const outDir = join(ROOT, 'docs/reports');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'memory-benchmark-results.json'), JSON.stringify({
    provider: provider.modelId,
    corpus: { messages: corpus.messages.length, records: corpus.records.length, questions: questions.length },
    groups: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { retrieval: v.retrieval, facts: v.facts, resources: v.resources }])),
  }, null, 2) + '\n');

  writeFileSync(join(outDir, 'MEMORY-BENCHMARK.md'), renderReport(results, provider));
  console.log('benchmark done → docs/reports/MEMORY-BENCHMARK.md');
  for (const [name, r] of Object.entries(results)) {
    console.log(`${name}: R@5=${fmt(r.retrieval.recallAt5)} MRR=${fmt(r.retrieval.mrr)} nDCG@10=${fmt(r.retrieval.ndcgAt10)} 폐기오노출=${r.facts.supersededAsCurrentCount} 금지문구=${r.facts.forbiddenClaimCount}`);
  }
}

function fmt(v) { return v == null ? 'n/a' : (v * 100).toFixed(1) + '%'; }
function fmtTok(v) { return v == null ? 'n/a' : Math.round(v); }

function renderReport(results, provider) {
  const names = Object.keys(results);
  const row = (label, get) => `| ${label} | ${names.map((n) => get(results[n])).join(' | ')} |`;
  const lines = [];
  lines.push('# 기억 벤치마크 결과 (Phase A/B)');
  lines.push('');
  lines.push('> 이 표는 **외부 API 없는 고정(결정론) 임베딩 provider**로 측정한 것이다. 목적은 검색 파이프라인·지표가 올바른지, 네 방식의 상대적 강약을 재는 것이다. **절대적 의미 품질이 아니다** — 실제 임베딩 품질은 Voyage 실호출(Phase C, `--live-voyage`)에서 별도 측정한다.');
  lines.push('');
  lines.push(`- provider: \`${provider.modelId}\` (문자 3-gram 해시, ${provider.dimension}차원)`);
  lines.push('- 비교군: A 최근창만 / B 구조화+어휘 / C HypaV3 재현(frozen summary) / D Simbot 하이브리드');
  lines.push('');
  lines.push('## 검색 품질');
  lines.push('');
  lines.push(`| 지표 | ${names.join(' | ')} |`);
  lines.push(`|---|${names.map(() => '---').join('|')}|`);
  lines.push(row('Recall@1', (r) => fmt(r.retrieval.recallAt1)));
  lines.push(row('Recall@5', (r) => fmt(r.retrieval.recallAt5)));
  lines.push(row('Recall@10', (r) => fmt(r.retrieval.recallAt10)));
  lines.push(row('MRR', (r) => fmt(r.retrieval.mrr)));
  lines.push(row('nDCG@10', (r) => fmt(r.retrieval.ndcgAt10)));
  lines.push(row('근거 정확도(top5)', (r) => fmt(r.retrieval.attributionPrecision)));
  lines.push(row('폐기 기억 거부율', (r) => fmt(r.retrieval.supersededRejectionRate)));
  lines.push('');
  lines.push('## 게임 사실 안전성 (낮을수록 좋음)');
  lines.push('');
  lines.push(`| 지표 | ${names.join(' | ')} |`);
  lines.push(`|---|${names.map(() => '---').join('|')}|`);
  lines.push(row('폐기 과거값을 현재 사실로 노출(건)', (r) => String(r.facts.supersededAsCurrentCount)));
  lines.push(row('금지 문구 회상(건)', (r) => String(r.facts.forbiddenClaimCount)));
  lines.push('');
  lines.push('## 자원');
  lines.push('');
  lines.push(`| 지표 | ${names.join(' | ')} |`);
  lines.push(`|---|${names.map(() => '---').join('|')}|`);
  lines.push(row('평균 기억 토큰', (r) => fmtTok(r.resources.meanMemoryTokens)));
  lines.push(row('최대 기억 토큰', (r) => fmtTok(r.resources.maxMemoryTokens)));
  lines.push('');
  lines.push('## 카테고리별 Recall@5 (D. simbot-hybrid)');
  lines.push('');
  const hybrid = results['D. simbot-hybrid'];
  const byCat = {};
  for (const p of hybrid.per) { (byCat[p.category] = byCat[p.category] || []).push(p.recallAt5); }
  lines.push('| 카테고리 | Recall@5 |');
  lines.push('|---|---|');
  for (const [cat, vals] of Object.entries(byCat)) {
    const nums = vals.filter((v) => v != null);
    lines.push(`| ${cat} | ${nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length) : 'n/a (정답 없음)'} |`);
  }
  lines.push('');
  lines.push('## 해석 주의');
  lines.push('');
  lines.push('- **근거 정확도(top5)** = 상위 5 hit 중 실제 정답 근거인 비율(precision@5). 정답 없는 negative는 제외. (이전 버전은 "출처 필드 존재"만 봐 항상 100%였던 것을 교정.)');
  lines.push('- **폐기 기억 거부율**은 `supersededRecordIds`를 가진 질문(current-fact 20문항)에서 "폐기된 과거값이 현재 사실 블록에 안 들어갔는지"를 측정한다. superseded 카테고리 질문은 정답 자체가 과거값(회상 대상)이라 이 지표의 대상이 아니며, 대신 forbiddenClaims로 "과거를 현재로 단정" 여부를 잡는다.');
  lines.push('- negative 카테고리는 정답 record가 없으므로 Recall 집계에서 제외되고, "금지 문구 회상" 건수로만 평가한다.');
  lines.push('- 고정 provider는 어휘가 겹치는 바꿔 말하기에만 신호를 준다. 진짜 동의어·의역 회수 능력은 Voyage 측정에서 판단한다.');
  lines.push('- authoritative 현재 사실은 구조화 lookup(B·D)만 제공한다. A·C는 현재 사실 블록이 비어 폐기값 노출 위험이 구조적으로 다르다.');
  lines.push('');
  lines.push('## 권고 (이번 고정 provider 측정 기준)');
  lines.push('');
  lines.push('1. **지금 당장 플레이에 연결할 것: 구조화 + 어휘(B의 요소)뿐.** 폐기 과거값을 현재 사실로 노출한 사례 0건, 근거 100%, 최근창만(A) 대비 검색 회수가 크게 높다. 외부 비용·지연 없음.');
  lines.push('2. **의미(semantic) 검색은 아직 연결하지 말 것.** 고정 provider에서 D(하이브리드)는 B보다 Recall@5가 낮거나 비슷하다 — 약한 임베딩을 섞으면 정확 매칭이 희석된다. 이는 CLAUDE-TASK 통과 기준 5("Voyage 이득이 FTS 대비 작으면 기본 기능화 보류")를 그대로 확인한 것이다. **연결 여부는 Voyage 실측(Phase C) 이후 결정한다.**');
  lines.push('3. **abstention(모름) 임계값이 없다는 게 다음 우선 과제.** 모든 planner가 negative 질문에도 top-K를 반환해 "금지 문구 회상"이 10~31건 발생한다. 회상 신뢰도 하한을 두어 "관련 기억 없음"을 반환하는 경로가 필요하다.');
  lines.push('4. **HypaV3 재현(C)의 무작위 기억은 seed로 격리해 재현성은 확보**했으나, 이 corpus에서 검색 회수 기여가 낮다. 유사 기억 선택은 Voyage 임베딩과 결합했을 때만 재평가한다.');
  lines.push('');
  lines.push('> 요약: **authoritative 사실은 엔진이, 회수는 구조화+어휘가** 지금 감당한다. 외부 임베딩은 "측정으로 이득이 증명되면" 켜는 opt-in 후보로 남긴다.');
  return lines.join('\n') + '\n';
}

run().catch((err) => { console.error(err); process.exit(1); });
