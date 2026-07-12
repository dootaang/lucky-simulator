import { describe, expect, it } from 'vitest';
import { inspectGameRuntimeSchema, parseSimPackManifest } from '../src/index.ts';

describe('SimPack schema validation', () => {
  it('accepts a load-critical manifest shape and unknown extensions', () => {
    const result = parseSimPackManifest({
      contract: 'simpack/0.2', source: {}, personas: {}, prompts: {}, modules: {}, content: {},
      runtime: { schema: {}, screens: [], extension: true }, assets: [], compatibility: {}, migrations: {}, unknown: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('reports legacy recommended game sections without throwing', () => {
    expect(inspectGameRuntimeSchema({ meta: { id: 'shop' } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("required property 'resources'") }),
    ]));
    expect(() => inspectGameRuntimeSchema({ meta: { id: 'shop' } })).not.toThrow();
  });
});
