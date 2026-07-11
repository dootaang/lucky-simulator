// SPDX-License-Identifier: GPL-3.0-or-later
// C1 — Voyage contextualized embeddings provider (실호출 배선 + 안전장치).
// EmbeddingProvider 계약(../contracts) 구현. 기본은 비활성 — VOYAGE_API_KEY + --live-voyage
// 이중 opt-in이 있을 때만 실제 네트워크를 친다(호출부 책임). 테스트는 fetch를 주입해 오프라인 검증.
//
// 결정론/주입: fetch·sleep·clock을 생성자에서 주입받아 전역 결합을 피한다.
// 안전: API 키·Authorization·본문 민감정보를 에러/로그에 노출하지 않는다.
// Voyage REST: POST https://api.voyageai.com/v1/contextualizedembeddings
//   요청 제약(코드로 검증): inputs<=1000, 전체 chunks<=16000, 전체 tokens<=120000.
//   query는 각각 [query] 한 묶음, document는 같은 그룹의 ordered chunks 한 묶음.

import type { EmbeddingProvider } from '../contracts.ts';
import type { EmbeddingCache } from '../embeddingCache.ts';

export const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/contextualizedembeddings';
export const VOYAGE_LIMITS = { maxInputs: 1000, maxChunks: 16000, maxTokens: 120000 } as const;

// Voyage 공식: context-3은 Risu 재현 기준, context-4는 최신 대안. 기본값은 재현 기준(context-3).
// 실측 전에는 어느 쪽이 우수한지 단정하지 않는다(핸드오프 금지선).
export type VoyageModel = 'voyage-context-3' | 'voyage-context-4';

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface VoyageDeps {
  apiKey: string;
  fetchImpl: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  cache?: EmbeddingCache;
  model?: VoyageModel;
  dimension?: 256 | 512 | 1024;
  maxRetries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface VoyageStats {
  requests: number;
  inputTokensEstimate: number;
  cacheHits: number;
  cacheMisses: number;
  retries: number;
  totalLatencyMs: number;
}

// 대략 토큰 추정(chars/4) — 요청 한도 사전 검증·통계용. 정확한 과금 토큰은 응답 usage로 갱신 가능.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// 에러 문자열에서 키·Authorization·긴 base64류를 가린다.
export function maskSecrets(input: string, apiKey: string): string {
  let out = input;
  if (apiKey) out = out.split(apiKey).join('[redacted-key]');
  return out
    .replace(/(authorization"?\s*[:=]\s*"?)(bearer\s+)?[a-z0-9._-]+/gi, '$1[redacted]')
    .replace(/pa-[A-Za-z0-9_-]{10,}/g, '[redacted-key]')
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '[redacted-key]');
}

export class VoyageError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'VoyageError';
    this.status = status;
  }
}

export interface VoyageProvider extends EmbeddingProvider {
  stats(): VoyageStats;
}

export function createVoyageProvider(deps: VoyageDeps): VoyageProvider {
  const apiKey = deps.apiKey;
  const fetchImpl = deps.fetchImpl;
  const sleep = deps.sleep;
  const now = deps.now;
  const cache = deps.cache;
  const model: VoyageModel = deps.model ?? 'voyage-context-3';
  const dimension: 256 | 512 | 1024 = deps.dimension ?? 1024;
  const maxRetries = deps.maxRetries ?? 4;
  const stats: VoyageStats = { requests: 0, inputTokensEstimate: 0, cacheHits: 0, cacheMisses: 0, retries: 0, totalLatencyMs: 0 };

  function assertLimits(groups: string[][]): void {
    const inputs = groups.length;
    let chunks = 0;
    let tokens = 0;
    for (const g of groups) {
      chunks += g.length;
      for (const c of g) tokens += estimateTokens(c);
    }
    if (inputs > VOYAGE_LIMITS.maxInputs) throw new VoyageError(`inputs ${inputs} > ${VOYAGE_LIMITS.maxInputs}`, 0);
    if (chunks > VOYAGE_LIMITS.maxChunks) throw new VoyageError(`chunks ${chunks} > ${VOYAGE_LIMITS.maxChunks}`, 0);
    if (tokens > VOYAGE_LIMITS.maxTokens) throw new VoyageError(`tokens ~${tokens} > ${VOYAGE_LIMITS.maxTokens}`, 0);
  }

  async function callOnce(groups: string[][], inputType: 'query' | 'document'): Promise<number[][][]> {
    assertLimits(groups);
    const body = JSON.stringify({ inputs: groups, model, input_type: inputType, output_dimension: dimension });
    let attempt = 0;
    for (;;) {
      const started = now();
      let res;
      try {
        res = await fetchImpl(VOYAGE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body,
          signal: deps.signal,
        });
      } catch (err) {
        // 네트워크·중단 오류 — 메시지에 키가 섞일 여지 차단.
        throw new VoyageError(maskSecrets(String((err as Error)?.message || err), apiKey), 0);
      }
      stats.requests += 1;
      stats.totalLatencyMs += Math.max(0, now() - started);
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new VoyageError(`voyage_retry_exhausted status ${res.status}`, res.status);
        const backoff = Math.min(30000, 500 * 2 ** attempt); // bounded exponential
        attempt += 1;
        stats.retries += 1;
        await sleep(backoff);
        // 백오프 대기 후 중단 신호를 확인 — 최대 30초 무의미 대기 후 진행 방지(감사 Minor).
        if (deps.signal && deps.signal.aborted) throw new VoyageError('voyage_aborted', 0);
        continue;
      }
      if (!res.ok) {
        const detail = maskSecrets(await res.text().catch(() => ''), apiKey).slice(0, 300);
        throw new VoyageError(`voyage_http_${res.status} ${detail}`, res.status);
      }
      const parsed = (await res.json()) as { data?: Array<{ embeddings?: number[][] }> };
      const data = Array.isArray(parsed.data) ? parsed.data : [];
      return groups.map((_, i) => (data[i] && Array.isArray(data[i].embeddings) ? data[i].embeddings! : []));
    }
  }

  // contextId는 그룹 조각 내용으로만 정한다(배치 순서 무관 — 캐시 안정성). 은 조각 구분자.
  function contextIdOf(inputType: string, group: string[]): string {
    return `${inputType}:${group.join('|')}`;
  }

  // 캐시 조회 후 미스만 실제 호출.
  async function embedGroups(groups: string[][], inputType: 'query' | 'document'): Promise<number[][][]> {
    const results: number[][][] = groups.map(() => []);
    const missGroups: string[][] = [];
    const missMap: number[] = [];
    groups.forEach((group, gi) => {
      if (!cache) { missGroups.push(group); missMap.push(gi); return; }
      const contextId = contextIdOf(inputType, group);
      const cachedChunks: number[][] = [];
      let allHit = true;
      for (const chunk of group) {
        const k = cache.key(model, dimension, inputType, contextId, chunk);
        const v = cache.get(k);
        if (v === undefined) { allHit = false; break; }
        cachedChunks.push(v);
      }
      if (allHit) { results[gi] = cachedChunks; stats.cacheHits += group.length; } else { missGroups.push(group); missMap.push(gi); stats.cacheMisses += group.length; }
    });
    if (missGroups.length) {
      for (const g of missGroups) for (const c of g) stats.inputTokensEstimate += estimateTokens(c);
      const fetched = await callOnce(missGroups, inputType);
      fetched.forEach((groupVecs, mi) => {
        const gi = missMap[mi];
        results[gi] = groupVecs;
        if (cache) {
          const group = missGroups[mi];
          const contextId = contextIdOf(inputType, group);
          group.forEach((chunk, ci) => {
            if (groupVecs[ci]) cache.set(cache.key(model, dimension, inputType, contextId, chunk), groupVecs[ci]);
          });
        }
      });
    }
    return results;
  }

  return {
    modelId: model,
    dimension,
    async embedDocumentGroups(groups) {
      return embedGroups(groups, 'document');
    },
    async embedQueries(queries) {
      const groups = queries.map((q) => [q]); // query는 각각 한 묶음
      const perGroup = await embedGroups(groups, 'query');
      return perGroup.map((g) => g[0] || []);
    },
    stats() {
      return { ...stats };
    },
  };
}
