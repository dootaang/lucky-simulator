import { describe, expect, it } from 'vitest';
import { parseCard } from '@simbot/card';
import { createMemoryRepository } from '@simbot/persistence';
import { resolveAssetMacros } from '@simbot/risu';
import { CardLibrary } from './card-library';
import { createMemoryCardBinaryStore } from './card-binary-store';

describe('card persistence regressions', () => {
  it('stores cards larger than the former local-storage limit in the binary store', async () => {
    const description = 'x'.repeat(10 * 1024 * 1024 + 1);
    const source = new TextEncoder().encode(JSON.stringify({
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { name: 'large-card', description },
    }));
    const library = new CardLibrary(createMemoryRepository<unknown>(), createMemoryCardBinaryStore());
    expect(await library.saveCard(parseCard(source, 'large.json'), 'card:large')).toBe(true);
    const restored = await library.loadCard('card:large');
    expect(restored?.name).toBe('large-card');
    expect(restored?.sourceBytes.byteLength).toBe(source.byteLength);
  });

  it('offers a relink entry when chat history remains but its card is missing', async () => {
    const repository = createMemoryRepository<unknown>();
    await repository.put({
      id: 'card:missing:chatindex',
      schemaHash: 'card:missing',
      title: 'Chat index',
      updatedAt: 7,
      payload: { contract: 'simbot-chat-index/0.1', projectId: 'card:missing', chats: [], activeChatId: null },
    });
    const missing = await new CardLibrary(repository, createMemoryCardBinaryStore()).listOrphanProjects();
    expect(missing).toEqual([expect.objectContaining({ projectId: 'card:missing', missing: true })]);
  });
});

describe('card image regressions', () => {
  it('keeps image rendering scoped to the active card assets', () => {
    const first = [{ name: 'scene', type: 'image', mime: 'image/png', bytes: new Uint8Array([1]) }];
    const second = [{ name: 'other', type: 'image', mime: 'image/png', bytes: new Uint8Array([2]) }];
    expect(resolveAssetMacros('{{raw::scene}}', first).content).toContain('data:image/png;base64,AQ==');
    const isolated = resolveAssetMacros('{{raw::scene}}', second);
    expect(isolated.content).not.toContain('data:image/png');
    expect(isolated.warnings[0]?.code).toBe('asset_missing');
  });

  it('recognizes AVIF card assets with the correct MIME type', () => {
    const card = parseCard(new TextEncoder().encode(JSON.stringify({
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'avif-card',
        assets: [{ name: 'first', type: 'image', ext: 'avif', uri: 'data:image/avif;base64,AQ==' }],
      },
    })));
    expect(card.assets[0]?.mime).toBe('image/avif');
  });
});
