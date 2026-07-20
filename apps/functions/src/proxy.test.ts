import { describe, expect, it, vi } from 'vitest';
import { forwardOllama } from './proxy.js';

describe('Ollama Cloud proxy', () => {
  it('forwards only the documented chat endpoint without logging or changing the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: { content: 'ok' } }), { status: 200 })) as unknown as typeof fetch;
    const result = await forwardOllama({ route: 'chat', method: 'POST', origin: 'https://lucky-sim.web.app', authorization: 'Bearer user-key', body: { model: 'qwen3', stream: false } }, fetchImpl);
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://ollama.com/api/chat', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer user-key' }) }));
  });

  it('rejects foreign origins, missing keys, and wrong methods before Ollama is contacted', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(forwardOllama({ route: 'chat', method: 'POST', origin: 'https://evil.example', authorization: 'Bearer key' }, fetchImpl)).resolves.toMatchObject({ status: 403 });
    await expect(forwardOllama({ route: 'chat', method: 'POST', origin: 'https://lucky-sim.web.app' }, fetchImpl)).resolves.toMatchObject({ status: 401 });
    await expect(forwardOllama({ route: 'chat', method: 'GET', origin: 'https://lucky-sim.web.app', authorization: 'Bearer key' }, fetchImpl)).resolves.toMatchObject({ status: 405 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
