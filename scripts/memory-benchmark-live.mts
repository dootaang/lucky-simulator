// Voyage 실측 벤치마크 러너 — 이중 opt-in(VOYAGE_API_KEY + --live-voyage)이 모두 있을 때만
// 실제 네트워크를 친다. 키가 없거나 플래그가 없으면 네트워크 호출 없이 사용법만 안내하고 정상 종료.
// 실행: node scripts/memory-benchmark-live.mts --live-voyage
//
// 이 세션 범위는 "배선 완료·실측 대기"다. 실제 Voyage 품질/지연/비용 수치는 키가 있을 때 산출된다.

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const hasFlag = process.argv.includes('--live-voyage');
const apiKey = process.env.VOYAGE_API_KEY || '';

function usage(reason: string): void {
  console.log('[memory-benchmark-live] 실측 미실행 —', reason);
  console.log('');
  console.log('사용법:');
  console.log('  1) 환경변수로 키 설정:  VOYAGE_API_KEY=... (셸/CI 비밀)');
  console.log('  2) 명시적 플래그:        node scripts/memory-benchmark-live.mts --live-voyage');
  console.log('  두 조건이 모두 있어야 네트워크를 호출합니다. 키는 로그·리포트·fixture에 절대 기록하지 않습니다.');
  console.log('  모델: voyage-context-3(Risu 재현 기준) 또는 --model voyage-context-4(최신 대안).');
  console.log('');
  console.log('현재 상태: provider·캐시·백오프·마스킹·grounded planner는 mock/fixed로 검증 완료(선 구현).');
  console.log('           실제 품질·지연·비용은 키가 있을 때 이 스크립트로 측정합니다.');
}

if (!hasFlag) { usage('--live-voyage 플래그가 없습니다.'); process.exit(0); }
if (!apiKey) { usage('VOYAGE_API_KEY 환경변수가 없습니다.'); process.exit(0); }

// 여기 도달 = 키 + 플래그 모두 존재. 실제 측정 배선.
async function run(): Promise<void> {
  const { createVoyageProvider } = await import('../app/core/memory/providers/voyage.ts');
  const { createEmbeddingCache } = await import('../app/core/memory/embeddingCache.ts');
  const corpus = require(join(ROOT, 'app/test/fixtures/memory-benchmark/corpus.json'));
  const model = process.argv.includes('--model')
    ? (process.argv[process.argv.indexOf('--model') + 1] as 'voyage-context-3' | 'voyage-context-4')
    : 'voyage-context-3';

  const provider = createVoyageProvider({
    apiKey,
    fetchImpl: fetch as never,
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    cache: createEmbeddingCache(),
    model,
  });
  console.log(`[live] model=${provider.modelId} dim=${provider.dimension} — 코퍼스 ${corpus.records.length} 레코드 임베딩 시작`);
  const groups = corpus.records.map((r: { text: string }) => [r.text]);
  const t0 = Date.now();
  await provider.embedDocumentGroups(groups);
  console.log(`[live] 완료 — 통계:`, provider.stats(), `wall=${Date.now() - t0}ms`);
  console.log('[live] 다음: 이 임베딩으로 semanticSearch를 planGroundedHybrid에 주입해 A~D 재측정(추후 세션).');
}

run().catch((err) => { console.error('[live] 실패:', err && err.message ? err.message : err); process.exit(1); });
