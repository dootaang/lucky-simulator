// SPDX-License-Identifier: GPL-3.0-or-later
// Risu persona PNG interoperability. The visible PNG remains the persona icon;
// metadata lives in a tEXt chunk named "persona" as base64 JSON.

import type { Persona } from './contracts';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function importRisuPersonaPng(bytes: Uint8Array, fileName = 'persona.png'): Persona {
  const chunks = readChunks(bytes);
  const metadata = chunks.find((chunk) => chunk.type === 'tEXt' && textKeyword(chunk.data) === 'persona');
  if (!metadata) throw new Error('Risu persona metadata not found');
  const zero = metadata.data.indexOf(0);
  const encoded = decoder.decode(metadata.data.subarray(zero + 1));
  const raw = JSON.parse(decoder.decode(fromBase64(encoded)));
  if (!raw || typeof raw.name !== 'string' || typeof raw.personaPrompt !== 'string') {
    throw new Error('Invalid Risu persona metadata');
  }
  return {
    contract: 'persona/0.1',
    id: stableId(`${fileName}:${raw.name}:${raw.personaPrompt}`),
    name: raw.name,
    prompt: raw.personaPrompt,
    icon: `data:image/png;base64,${toBase64(bytes)}`,
    note: typeof raw.note === 'string' ? raw.note : '',
    embeddedModule: raw.embeddedModule ?? null,
    source: { source: 'persona', path: 'tEXt:persona', note: fileName },
    version: 1,
  };
}

export function exportRisuPersonaPng(persona: Persona, iconPng?: Uint8Array): Uint8Array {
  const icon = iconPng || dataUrlBytes(persona.icon);
  if (!icon) throw new Error('Persona PNG icon bytes are required');
  const chunks = readChunks(icon).filter((chunk) => !(chunk.type === 'tEXt' && textKeyword(chunk.data) === 'persona'));
  const payload = toBase64(encoder.encode(JSON.stringify({
    name: persona.name,
    personaPrompt: persona.prompt,
    note: persona.note || '',
  })));
  const personaChunk = makeChunk('tEXt', concat(encoder.encode('persona'), Uint8Array.of(0), encoder.encode(payload)));
  const output: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    if (chunk.type === 'IEND') output.push(personaChunk);
    output.push(chunk.raw);
  }
  return concat(...output);
}

type PngChunk = { type: string; data: Uint8Array; raw: Uint8Array };

function readChunks(bytes: Uint8Array): PngChunk[] {
  if (bytes.length < 20 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('Not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const start = offset;
    const length = view.getUint32(offset); offset += 4;
    if (offset + 8 + length > bytes.length) throw new Error('Truncated PNG chunk');
    const type = decoder.decode(bytes.subarray(offset, offset + 4)); offset += 4;
    const data = bytes.subarray(offset, offset + length); offset += length + 4;
    chunks.push({ type, data, raw: bytes.slice(start, offset) });
    if (type === 'IEND') break;
  }
  if (!chunks.some((chunk) => chunk.type === 'IEND')) throw new Error('PNG IEND chunk missing');
  return chunks;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = encoder.encode(type);
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(typeBytes, 4); out.set(data, 8);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(concat(typeBytes, data)));
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function textKeyword(data: Uint8Array): string { const zero = data.indexOf(0); return decoder.decode(data.subarray(0, zero < 0 ? data.length : zero)); }
function concat(...parts: Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; }
function stableId(value: string): string { let hash = 2166136261; for (const byte of encoder.encode(value)) { hash ^= byte; hash = Math.imul(hash, 16777619); } return `persona-${(hash >>> 0).toString(16).padStart(8, '0')}`; }
function dataUrlBytes(value: string): Uint8Array | null { const match = /^data:image\/png;base64,(.+)$/i.exec(String(value || '')); return match ? fromBase64(match[1]) : null; }
function toBase64(bytes: Uint8Array): string { const nodeBuffer = (globalThis as any).Buffer; if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64'); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function fromBase64(value: string): Uint8Array { const nodeBuffer = (globalThis as any).Buffer; if (nodeBuffer) return Uint8Array.from(nodeBuffer.from(value, 'base64')); const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
