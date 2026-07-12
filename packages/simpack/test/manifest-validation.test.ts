import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createSimPack, packSimPack, unpackSimPack } from '../src/index.ts';

function archiveWith(manifest: unknown): Uint8Array {
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) });
}

describe('SimPack load-time manifest validation', () => {
  it('validates createSimPack output through a real unpack roundtrip', () => {
    const project = createSimPack({ schema: { meta: { id: 'partial' } } });
    expect(unpackSimPack(packSimPack(project)).manifest).toEqual(project.manifest);
  });

  it('rejects a missing runtime.schema with its AJV path in the message', () => {
    const manifest = structuredClone(createSimPack({ schema: {} }).manifest) as unknown as Record<string, unknown>;
    delete (manifest.runtime as Record<string, unknown>).schema;
    expect(() => unpackSimPack(archiveWith(manifest))).toThrow(/simpack_manifest_schema_invalid:.*runtime.*schema/);
  });

  it('keeps unknown fields and partial game schemas loadable', () => {
    const manifest = structuredClone(createSimPack({ schema: { meta: { id: 'shop' } } }).manifest) as unknown as Record<string, unknown>;
    manifest.futureExtension = { enabled: true };
    (manifest.runtime as Record<string, unknown>).futureRuntimeField = 'kept';
    expect(unpackSimPack(archiveWith(manifest)).manifest).toMatchObject({ futureExtension: { enabled: true } });
  });
});
