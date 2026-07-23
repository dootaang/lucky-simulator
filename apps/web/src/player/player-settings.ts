import {
  createProvider,
  isOllamaCloudConfig,
  type AuxConfig,
  type ModelProvider,
  type ProviderConfig,
  type ProviderId,
} from '@simbot/session';

export type AuxSetting = { provider: ProviderId; model: string; apiKey: string };
export type ProviderProfile = { apiKey: string; endpoint: string; location: string; model: string };
export type PlayerSettings = ProviderConfig & {
  endpoint: string;
  voyageKey: string;
  assetWidth: number;
  textSize: number;
  keepSimulationOpen: boolean;
  auxEnabled: boolean;
  auxSlots: { translation: AuxSetting; emotion: AuxSetting; memory: AuxSetting };
  providerProfiles: Partial<Record<ProviderId, ProviderProfile>>;
};

export const providerChoices: Array<{ id: ProviderId; label: string }> = [
  { id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' }, { id: 'vertex', label: 'Google Vertex AI' },
  { id: 'copilot', label: 'GitHub Copilot' }, { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' }, { id: 'vercel', label: 'Vercel AI Gateway' },
  { id: 'nanogpt', label: 'NanoGPT' }, { id: 'cerebras', label: 'Cerebras' },
  { id: 'ollama-cloud', label: 'Ollama Cloud' }, { id: 'ollama', label: 'Ollama 로컬 · 네트워크' },
  { id: 'custom', label: 'OpenAI 호환 · 커스텀' },
];

export const auxChoices = [
  { id: 'translation' as const, label: '번역' },
  { id: 'emotion' as const, label: '감정' },
  { id: 'memory' as const, label: '메모리' },
];

const auxSlot = (): AuxSetting => ({ provider: 'openai', model: 'gpt-4.1-mini', apiKey: '' });

export function defaultPlayerSettings(): PlayerSettings {
  return {
    provider: 'openai', endpoint: '', location: '', model: 'gpt-4.1-mini', apiKey: '', voyageKey: '',
    assetWidth: 32, textSize: 15.5, keepSimulationOpen: true, maxContext: 24000, auxEnabled: false,
    auxSlots: { translation: auxSlot(), emotion: auxSlot(), memory: auxSlot() }, providerProfiles: {},
  };
}

export function readPlayerSettings(storage: Pick<Storage, 'getItem'> = localStorage): PlayerSettings {
  const base = defaultPlayerSettings();
  try {
    const raw = JSON.parse(storage.getItem('simbot.llm') ?? 'null') as Partial<PlayerSettings> | null;
    if (!raw) return base;
    const merged: PlayerSettings = { ...base, ...raw, auxSlots: { ...base.auxSlots, ...(raw.auxSlots ?? {}) }, providerProfiles: { ...(raw.providerProfiles ?? {}) } };
    if (!raw.provider) merged.provider = 'custom';
    if (!raw.providerProfiles) merged.providerProfiles = { [merged.provider]: { apiKey: merged.apiKey ?? '', endpoint: merged.endpoint ?? '', location: merged.location ?? '', model: merged.model ?? '' } };
    return merged;
  } catch { return base; }
}

export function withStashedProviderProfile(settings: PlayerSettings): PlayerSettings['providerProfiles'] {
  return { ...settings.providerProfiles, [settings.provider]: { apiKey: settings.apiKey ?? '', endpoint: settings.endpoint ?? '', location: settings.location ?? '', model: settings.model ?? '' } };
}

export function playerProvider(settings: PlayerSettings): ModelProvider {
  if (settings.apiKey.trim()) return createProvider(settings);
  return { async complete(request) { if (request.purpose === 'management') throw new Error('api_key_required'); return { text: '프로바이더 설정에서 API 키와 모델을 입력하면 실제 대화를 시작할 수 있습니다.', events: [] }; } };
}

export function playerAuxConfig(settings: PlayerSettings): AuxConfig {
  const slots = Object.fromEntries(Object.entries(settings.auxSlots).map(([name, value]) => [name, {
    provider: value.provider, model: value.model, apiKey: value.apiKey.trim() || settings.apiKey,
    ...(value.provider === 'custom' && settings.endpoint ? { endpoint: settings.endpoint } : {}),
  }])) as AuxConfig['slots'];
  return { enabled: settings.auxEnabled, slots };
}

export function isPlayerAiReady(settings: PlayerSettings) {
  return Boolean(settings.apiKey.trim()) || settings.provider === 'ollama' && !isOllamaCloudConfig(settings);
}
