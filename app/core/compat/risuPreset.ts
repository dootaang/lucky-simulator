// SPDX-License-Identifier: GPL-3.0-or-later
// Lossless Risu .risup/.risupreset codec plus PromptItem adapter.

import { compressSync, decompressSync } from 'fflate';
import { decode, encode } from 'msgpackr';
import type { PromptBlock, PromptPreset, PromptRole, Provenance } from './contracts';

declare const require: (id: string) => any;

const RPACK_DECODE = Uint8Array.from([111,23,42,71,54,123,92,155,37,124,78,114,224,193,16,244,158,64,237,186,134,141,104,171,252,251,68,116,201,149,88,203,45,161,245,66,173,95,185,97,76,34,6,85,117,164,2,132,35,165,91,110,145,239,144,122,156,82,209,151,167,169,40,142,178,146,89,166,172,222,190,220,228,183,188,57,175,39,210,121,230,125,67,103,120,247,207,137,182,250,170,248,217,229,147,128,80,11,138,21,163,204,187,131,136,48,106,74,130,127,195,160,234,162,181,168,152,133,192,29,246,177,7,53,86,226,180,105,243,232,174,200,218,15,221,150,227,143,148,179,118,1,47,14,235,240,13,32,75,63,205,46,236,119,115,176,60,225,101,157,189,194,4,31,154,50,17,12,238,87,108,99,159,191,20,72,233,19,8,18,65,196,102,58,213,211,153,184,139,62,100,28,202,212,231,199,253,30,73,9,25,26,3,81,10,96,83,52,55,24,255,44,112,135,113,148,33,51,107,69,198,5,77,84,93,27,41,214,129,215,126,216,242,61,90,49,254,109,219,36,0,94,223,79,22,43,197,249,241,140,206,208,98,56,70,38,200]);
// Use the same audited permutation as the existing .risum reader. Keeping a
// single map prevents the two Risu container codecs from drifting apart.
const RPACK_MAP: Uint8Array = require('../card/risum.js').DECODE_MAP;
const RPACK_ENCODE = inverseMap(RPACK_MAP);

export interface ImportedRisuPreset { preset: PromptPreset; rawPreset: Record<string, unknown>; sourceBytes: Uint8Array; }

export async function importRisuPreset(bytes: Uint8Array, fileName = 'preset.risup'): Promise<ImportedRisuPreset> {
  const packed = /\.risup$/i.test(fileName) && !/\.risupreset$/i.test(fileName) ? mapBytes(bytes, RPACK_MAP) : bytes;
  const outer = decode(decompressSync(packed)) as Record<string, unknown>;
  if (!outer || outer.type !== 'preset' || ![0, 2].includes(Number(outer.presetVersion))) throw new Error('Unsupported Risu preset envelope');
  const encrypted = asBytes(outer.preset ?? outer.pres);
  const rawPreset = decode(new Uint8Array(await crypt(encrypted, 'decrypt'))) as Record<string, unknown>;
  return { preset: fromRisuPreset(rawPreset, fileName), rawPreset, sourceBytes: bytes.slice() };
}

export async function exportRisuPreset(preset: PromptPreset, packed = true): Promise<Uint8Array> {
  const raw = isObject(preset.raw) ? structuredClone(preset.raw) : {};
  raw.name = preset.name;
  raw.promptTemplate = toRisuPromptTemplate(preset.blocks);
  raw.assistantPrefill = preset.settings.assistantPrefill;
  raw.sendChatAsSystem = preset.settings.sendChatAsSystem;
  raw.sendName = preset.settings.sendNames;
  const encrypted = new Uint8Array(await crypt(encode(raw), 'encrypt'));
  const compressed = compressSync(encode({ presetVersion: 2, type: 'preset', preset: encrypted }));
  return packed ? mapBytes(compressed, RPACK_ENCODE) : compressed;
}

export function fromRisuPreset(raw: Record<string, unknown>, fileName = 'preset.risup'): PromptPreset {
  const template = Array.isArray(raw.promptTemplate) ? raw.promptTemplate : [];
  return {
    contract: 'prompt-preset/0.1', id: stableId(`${fileName}:${String(raw.name || '')}`),
    name: String(raw.name || 'Risu preset'), compatibilityMode: 'risu', version: 1,
    blocks: template.map((item, index) => fromRisuPromptItem(item, index)).filter((value): value is PromptBlock => !!value),
    settings: {
      assistantPrefill: String(raw.assistantPrefill || ''),
      sendNames: raw.sendName === true,
      sendChatAsSystem: raw.sendChatAsSystem === true,
    },
    raw: structuredClone(raw),
  };
}

function fromRisuPromptItem(value: unknown, index: number): PromptBlock | null {
  if (!isObject(value) || typeof value.type !== 'string') return null;
  const source: Provenance = { source: 'preset', path: `$.promptTemplate[${index}]` };
  const base = { id: String(value.id || `risu-${index}`), name: String(value.name || value.type), enabled: value.enabled !== false, source };
  const role = normalizeRole(value.role ?? value.role2);
  if (value.type === 'plain' || value.type === 'jailbreak') return { ...base, type: value.type, role, text: String(value.text || ''), slot: normalizeSlot(value.type2) };
  if (['description', 'persona', 'lorebook', 'authornote', 'memory', 'postEverything'].includes(value.type)) return { ...base, type: value.type as 'description', role, innerFormat: typeof value.innerFormat === 'string' ? value.innerFormat : undefined };
  if (value.type === 'chat') return { ...base, type: 'chat', rangeStart: finiteInt(value.rangeStart, -1000), rangeEnd: value.rangeEnd === 'end' ? 'end' : finiteInt(value.rangeEnd, 0) };
  if (value.type === 'cache') return { ...base, type: 'cache', depth: Math.max(0, finiteInt(value.depth, 0)), role: normalizeCacheRole(value.role) };
  return null;
}

function toRisuPromptTemplate(blocks: PromptBlock[]): Record<string, unknown>[] {
  return blocks.filter((block) => !['engineFacts', 'availableActions', 'groundedMemory'].includes(block.type)).map((block) => {
    const common: Record<string, unknown> = { type: block.type, name: block.name, enabled: block.enabled };
    if (block.type === 'plain' || block.type === 'jailbreak') return { ...common, type2: block.slot || 'normal', text: block.text, role: block.role === 'assistant' ? 'bot' : block.role };
    if (block.type === 'chat') return { ...common, rangeStart: block.rangeStart, rangeEnd: block.rangeEnd };
    if (block.type === 'cache') return { ...common, depth: block.depth, role: block.role };
    return { ...common, role2: ('role' in block && block.role === 'assistant') ? 'bot' : ('role' in block ? block.role : undefined), innerFormat: 'innerFormat' in block ? block.innerFormat : undefined };
  });
}

async function crypt(data: Uint8Array, operation: 'encrypt' | 'decrypt'): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('WebCrypto is required for Risu preset encryption');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode('risupreset'));
  const key = await subtle.importKey('raw', digest, 'AES-GCM', false, [operation]);
  const owned = Uint8Array.from(data);
  return subtle[operation]({ name: 'AES-GCM', iv: new Uint8Array(12) }, key, owned);
}

function normalizeRole(value: unknown): PromptRole { return value === 'user' ? 'user' : (value === 'bot' || value === 'assistant' || value === 'char') ? 'assistant' : 'system'; }
function normalizeCacheRole(value: unknown): PromptRole | 'all' { return value === 'all' ? 'all' : normalizeRole(value); }
function normalizeSlot(value: unknown): 'main' | 'globalNote' | 'normal' { return value === 'main' || value === 'globalNote' ? value : 'normal'; }
function finiteInt(value: unknown, fallback: number): number { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : fallback; }
function isObject(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function asBytes(value: unknown): Uint8Array { if (value instanceof Uint8Array) return value; if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength); throw new Error('Invalid encrypted preset payload'); }
function inverseMap(map: Uint8Array): Uint8Array { const inverse = new Uint8Array(256); map.forEach((value, index) => { inverse[value] = index; }); return inverse; }
function mapBytes(bytes: Uint8Array, map: Uint8Array): Uint8Array { return Uint8Array.from(bytes, (value) => map[value]); }
function stableId(value: string): string { let hash = 2166136261; for (const byte of new TextEncoder().encode(value)) { hash ^= byte; hash = Math.imul(hash, 16777619); } return `preset-${(hash >>> 0).toString(16).padStart(8, '0')}`; }
