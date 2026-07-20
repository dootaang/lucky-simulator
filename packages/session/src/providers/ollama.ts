import type { ModelProvider } from '../index.ts';
import { jsonText, maskSecrets } from './openai.ts';

export interface OllamaCloudOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  fetch?: typeof globalThis.fetch;
}

/** Ollama Cloud's documented native /api/chat contract. */
export function createOllamaCloudProvider(options: OllamaCloudOptions): ModelProvider {
  const request = options.fetch ?? globalThis.fetch;
  if (typeof request !== 'function') throw new Error('fetch_unavailable');
  return {
    async complete({ prompt, signal, format = 'json' }) {
      const generationOptions = {
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.maxTokens === undefined ? {} : { num_predict: options.maxTokens }),
        ...(options.topP === undefined ? {} : { top_p: options.topP }),
        ...(options.topK === undefined ? {} : { top_k: options.topK }),
        ...(options.seed === undefined ? {} : { seed: options.seed }),
      };
      let response: Response;
      try {
        response = await request(options.endpoint.replace(/\/$/, ''), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify({
            model: options.model,
            messages: prompt.messages,
            stream: false,
            ...(Object.keys(generationOptions).length ? { options: generationOptions } : {}),
          }),
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        throw new Error(`model_network:${maskSecrets(error instanceof Error ? error.message : String(error), options.apiKey)}`);
      }
      if (!response.ok) throw new Error(`model_http_${response.status}:${maskSecrets(await response.text().catch(() => ''), options.apiKey).slice(0, 300)}`);
      const data = await response.json() as Record<string, unknown>;
      const message = data.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (typeof content !== 'string') throw new Error('model_content_missing');
      return format === 'prose' ? { text: content, events: [], speakers: [], memories: [] } : jsonText(content);
    },
  };
}
