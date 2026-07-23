import { describe, expect, it } from 'vitest';
import { defaultPlayerSettings, isPlayerAiReady, playerAuxConfig, playerProvider, readPlayerSettings, withStashedProviderProfile } from './player-settings';

describe('player settings boundary', () => {
  it('restores defaults after malformed storage and preserves the legacy custom-provider migration', () => {
    expect(readPlayerSettings({ getItem: () => '{broken' })).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini', maxContext: 24000 });
    const migrated = readPlayerSettings({ getItem: () => JSON.stringify({ apiKey: 'old-key', model: 'old-model' }) });
    expect(migrated.provider).toBe('custom');
    expect(migrated.providerProfiles.custom).toMatchObject({ apiKey: 'old-key', model: 'old-model' });
  });

  it('keeps credentials isolated per provider and inherits the main key only for auxiliary slots', () => {
    const settings = defaultPlayerSettings();
    settings.apiKey = 'main-key'; settings.model = 'gpt'; settings.endpoint = 'https://example.test';
    settings.auxEnabled = true; settings.auxSlots.translation = { provider: 'custom', model: 'translator', apiKey: '' };
    expect(withStashedProviderProfile(settings).openai).toMatchObject({ apiKey: 'main-key', model: 'gpt' });
    expect(playerAuxConfig(settings).slots.translation).toMatchObject({ apiKey: 'main-key', endpoint: 'https://example.test' });
  });

  it('treats local Ollama as ready without a key and keeps the empty-provider guidance behavior', async () => {
    const settings = defaultPlayerSettings(); settings.provider = 'ollama'; settings.endpoint = 'http://localhost:11434'; settings.apiKey = '';
    expect(isPlayerAiReady(settings)).toBe(true);
    const placeholder = playerProvider(defaultPlayerSettings());
    await expect(placeholder.complete({ prompt: { messages: [], assistantPrefill: '', trace: [], warnings: [] } })).resolves.toMatchObject({ text: expect.stringContaining('API 키') });
    await expect(placeholder.complete({ prompt: { messages: [], assistantPrefill: '', trace: [], warnings: [] }, purpose: 'management' })).rejects.toThrow('api_key_required');
  });
});
