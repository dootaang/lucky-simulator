export const ALLOWED_ORIGINS = new Set([
  'https://lucky-sim.web.app',
  'https://lucky-sim.firebaseapp.com',
  'https://simbot-simulator.web.app',
  'https://simbot-simulator.firebaseapp.com',
]);

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TARGETS = {
  chat: { url: 'https://ollama.com/api/chat', method: 'POST' },
  tags: { url: 'https://ollama.com/api/tags', method: 'GET' },
} as const;

export interface ProxyInput {
  route: keyof typeof TARGETS;
  method: string;
  origin?: string;
  authorization?: string;
  body?: unknown;
}

export interface ProxyOutput {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function json(status: number, code: string): ProxyOutput {
  return { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ error: code }) };
}

export async function forwardOllama(input: ProxyInput, fetchImpl: typeof fetch = fetch): Promise<ProxyOutput> {
  if (!input.origin || !ALLOWED_ORIGINS.has(input.origin)) return json(403, 'origin_not_allowed');
  const target = TARGETS[input.route];
  if (input.method.toUpperCase() !== target.method) return json(405, 'method_not_allowed');
  if (!input.authorization?.startsWith('Bearer ') || input.authorization.length > 4096) return json(401, 'ollama_api_key_required');
  const body = target.method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined;
  if (body && Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) return json(413, 'request_too_large');

  let response: Response;
  try {
    response = await fetchImpl(target.url, {
      method: target.method,
      headers: { authorization: input.authorization, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return json(502, error instanceof DOMException && error.name === 'TimeoutError' ? 'ollama_timeout' : 'ollama_unreachable');
  }
  const responseBody = await response.text();
  if (Buffer.byteLength(responseBody, 'utf8') > MAX_RESPONSE_BYTES) return json(502, 'ollama_response_too_large');
  return {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    body: responseBody,
  };
}
