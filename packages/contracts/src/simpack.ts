import type { JsonObject } from './json.ts';
import type { NavigationItem, ScreenDocument } from './screens.ts';
import { createParser, type ValidationIssue } from './validation.ts';

export interface BlobReference { readonly path: string; readonly sha256: string; readonly size: number; readonly mime: string; }
export interface SimPackAsset { readonly id: string; readonly name: string; readonly kind: string; readonly blob: BlobReference | null; readonly canonical: JsonObject; readonly source: JsonObject | null; }
export interface SimPackManifest {
  readonly contract: 'simpack/0.2'; readonly id: string; readonly title: string; readonly revision: number;
  readonly source: JsonObject; readonly risu: JsonObject | null; readonly personas: JsonObject; readonly prompts: JsonObject; readonly modules: JsonObject; readonly content: JsonObject;
  readonly runtime: JsonObject & { readonly schema: JsonObject | null; readonly screens: readonly ScreenDocument[]; readonly navigation: readonly NavigationItem[] };
  readonly assets: readonly SimPackAsset[]; readonly evidence: readonly JsonObject[]; readonly compatibility: JsonObject; readonly migrations: JsonObject;
}

const openObjectSchema = { type: 'object', additionalProperties: true } as const;
const nullableObjectSchema = { type: ['object', 'null'], additionalProperties: true } as const;

/** Only the structure required by the SimPack loader and runtime adapter is fatal. */
export const parseSimPackManifest = createParser<SimPackManifest>({
  type: 'object',
  additionalProperties: true,
  required: ['contract', 'source', 'personas', 'prompts', 'modules', 'content', 'runtime', 'assets', 'compatibility', 'migrations'],
  properties: {
    contract: { type: 'string', const: 'simpack/0.2' },
    source: openObjectSchema,
    personas: openObjectSchema,
    prompts: openObjectSchema,
    modules: openObjectSchema,
    content: openObjectSchema,
    runtime: {
      type: 'object',
      additionalProperties: true,
      required: ['schema', 'screens'],
      properties: {
        schema: nullableObjectSchema,
        screens: { type: 'array', items: true },
      },
    },
    assets: { type: 'array', items: true },
    compatibility: openObjectSchema,
    migrations: openObjectSchema,
  },
} as unknown as import('ajv').JSONSchemaType<SimPackManifest>);

const parseRecommendedGameSchema = createParser<Record<string, unknown>>({
  type: 'object',
  additionalProperties: true,
  required: ['meta', 'resources', 'scales', 'ladders', 'entities', 'events'],
  properties: {
    meta: openObjectSchema,
    resources: { type: 'array', items: true },
    scales: { type: 'array', items: true },
    ladders: { type: 'array', items: true },
    entities: { type: 'array', items: true },
    events: { type: 'array', items: true },
  },
} as unknown as import('ajv').JSONSchemaType<Record<string, unknown>>);

/** Legacy-compatible advisory validation: callers decide how to surface these warnings. */
export function inspectGameRuntimeSchema(input: unknown): readonly ValidationIssue[] {
  const result = parseRecommendedGameSchema(input);
  return result.ok ? [] : result.error;
}
