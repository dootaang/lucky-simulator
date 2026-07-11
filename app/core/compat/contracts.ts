// SPDX-License-Identifier: GPL-3.0-or-later

export type RisuSourceFormat = 'charx' | 'png' | 'jpeg' | 'json' | 'risum' | 'persona-png' | 'risup' | 'unknown';
export type CompatibilityStatus = 'supported' | 'preserved' | 'translated' | 'degraded' | 'blocked';
export type PromptRole = 'system' | 'user' | 'assistant';

export interface Provenance {
  source: 'card' | 'module' | 'preset' | 'persona' | 'asset' | 'compiler' | 'user';
  path: string;
  note?: string;
}

export interface UnsupportedFeature {
  id: string;
  label: string;
  status: CompatibilityStatus;
  count: number;
  reason: string;
  evidence: Provenance[];
}

export interface AssetReference {
  name: string;
  type: string;
  ext: string;
  uri: string;
  mime: string;
  found: boolean;
  size: number;
}

export interface NormalizedCharacter {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions: string;
  creator: string;
  characterVersion: string;
  tags: string[];
}

export interface ModuleBinding {
  id: string;
  name: string;
  namespace: string;
  scope: 'embedded' | 'global' | 'preset' | 'character' | 'chat' | 'persona';
  lowLevelAccess: boolean;
  capabilities: string[];
  provenance: Provenance;
}

export interface RisuCompatibilityEnvelope {
  contract: 'risu-compatibility/0.1';
  source: {
    format: RisuSourceFormat;
    version: string;
    fileName: string;
    displayName: string;
  };
  raw: {
    card: unknown;
    sourceBytes: Uint8Array | null;
    containerEntries: Array<{ name: string; size: number; kind: string }>;
    extensions: Record<string, unknown>;
  };
  normalized: {
    character: NormalizedCharacter | null;
    lorebooks: unknown[];
    assets: AssetReference[];
    modules: ModuleBinding[];
    persona: Persona | null;
    promptPreset: PromptPreset | null;
  };
  compatibility: {
    features: UnsupportedFeature[];
    totals: Record<CompatibilityStatus, number>;
  };
  provenance: Provenance[];
}

export interface Persona {
  contract: 'persona/0.1';
  id: string;
  name: string;
  prompt: string;
  icon: string;
  note: string;
  embeddedModule: unknown | null;
  source: Provenance | null;
  version: number;
}

export type PromptBlock =
  // slot: Risu의 plain type2 구분 고증 — main은 카드 systemPrompt의 {{original}} 자리,
  // globalNote는 post-history instructions의 {{original}} 자리. 생략 시 'normal'.
  | { id: string; type: 'plain' | 'jailbreak'; name: string; enabled: boolean; role: PromptRole; text: string; slot?: 'main' | 'globalNote' | 'normal'; source: Provenance | null }
  | { id: string; type: 'description' | 'persona' | 'lorebook' | 'authornote' | 'memory' | 'postEverything'; name: string; enabled: boolean; role?: PromptRole; innerFormat?: string; source: Provenance | null }
  | { id: string; type: 'chat'; name: string; enabled: boolean; rangeStart: number; rangeEnd: number | 'end'; source: Provenance | null }
  | { id: string; type: 'cache'; name: string; enabled: boolean; depth: number; role: PromptRole | 'all'; source: Provenance | null }
  | { id: string; type: 'engineFacts' | 'availableActions' | 'groundedMemory'; name: string; enabled: boolean; role: 'system'; source: Provenance | null };

export interface PromptPreset {
  contract: 'prompt-preset/0.1';
  id: string;
  name: string;
  compatibilityMode: 'risu' | 'simpack';
  version: number;
  blocks: PromptBlock[];
  settings: {
    assistantPrefill: string;
    sendNames: boolean;
    sendChatAsSystem: boolean;
  };
  raw: unknown | null;
}

