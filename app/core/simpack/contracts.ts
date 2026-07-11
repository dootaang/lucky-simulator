// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModuleBinding, Persona, PromptPreset, Provenance, RisuCompatibilityEnvelope } from '../compat/contracts';

export interface SimPackBlobRef { path: string; sha256: string; size: number; mime: string; }
export interface SimPackAsset { id: string; name: string; kind: string; blob: SimPackBlobRef | null; canonical: { entityId?: string; emotion?: string; outfit?: string; usage?: string }; source: Provenance | null; }
export interface SimPackScreen { id: string; title: string; layout: string; regions: unknown[]; visibleWhen?: unknown; }

export interface SimPackV02 {
  contract: 'simpack/0.2';
  id: string;
  title: string;
  revision: number;
  source: { card: { fileName: string; format: string; version: string; blob: SimPackBlobRef | null }; provenance: Provenance[] };
  risu: { envelope: Omit<RisuCompatibilityEnvelope, 'raw'> & { raw: { card: unknown; sourceBlob: SimPackBlobRef | null; containerEntries: unknown[]; extensions: Record<string, unknown> } } } | null;
  personas: { library: Persona[]; defaultPersonaId: string | null; sessionBinding: { boundPersonaId: string; snapshot: Persona } | null };
  prompts: { presets: PromptPreset[]; defaultPresetId: string | null; sessionBinding: { id: string; version: number; hash: string; snapshot: PromptPreset } | null };
  modules: { bindings: ModuleBinding[]; installed: Array<{ id: string; version: string; enabled: boolean }> };
  content: { characters: unknown[]; lorebooks: unknown[]; locations: unknown[]; items: unknown[] };
  runtime: { schema: unknown; initialState: unknown; screens: SimPackScreen[]; navigation: Array<{ id: string; screenId: string; label: string }>; options: Record<string, unknown>; featureToggles: Record<string, boolean> };
  assets: SimPackAsset[];
  evidence: Array<{ path: string; confidence: number; refs: Provenance[]; note?: string }>;
  compatibility: { conflicts: Array<{ path: string; choices: unknown[]; resolution: unknown | null }>; unsupported: unknown[] };
  migrations: { current: 2; history: Array<{ from: number; to: number; note: string }> };
}

