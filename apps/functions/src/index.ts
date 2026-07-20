import { onRequest } from 'firebase-functions/v2/https';
import { forwardOllama } from './proxy.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const visits = new Map<string, { start: number; count: number }>();

function allowed(ip: string, now = Date.now()): boolean {
  const current = visits.get(ip);
  if (!current || now - current.start >= WINDOW_MS) {
    visits.set(ip, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_WINDOW;
}

export const ollamaProxy = onRequest({
  region: 'asia-northeast3',
  timeoutSeconds: 120,
  memory: '256MiB',
  minInstances: 0,
  maxInstances: 1,
  concurrency: 20,
  cors: false,
}, async (request, response) => {
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  if (!allowed(ip)) {
    response.status(429).set('cache-control', 'no-store').json({ error: 'rate_limited' });
    return;
  }
  const route = request.path.endsWith('/tags') ? 'tags' : request.path.endsWith('/chat') ? 'chat' : null;
  if (!route) {
    response.status(404).set('cache-control', 'no-store').json({ error: 'route_not_found' });
    return;
  }
  const proxyInput: Parameters<typeof forwardOllama>[0] = {
    route,
    method: request.method,
    body: request.body,
  };
  const origin = request.get('origin');
  const authorization = request.get('authorization');
  if (origin) proxyInput.origin = origin;
  if (authorization) proxyInput.authorization = authorization;
  const result = await forwardOllama(proxyInput);
  for (const [name, value] of Object.entries(result.headers)) response.set(name, value);
  response.status(result.status).send(result.body);
});
