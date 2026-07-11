// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');

const CONTRACT = 'simpack/0.2';
const MAX_PACK_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 20000;

function createSimPack(input = {}) {
  const envelope = input.risuEnvelope || null;
  const sourceBytes = input.sourceBytes instanceof Uint8Array ? input.sourceBytes : envelope && envelope.raw && envelope.raw.sourceBytes;
  const sourcePath = sourceBytes ? `blobs/source/${safeName(input.fileName || envelope && envelope.source.fileName || 'card.bin')}` : null;
  const sourceBlob = sourceBytes ? blobRef(sourcePath, sourceBytes, input.sourceMime || 'application/octet-stream') : null;
  const risu = envelope ? {
    envelope: {
      ...clone({ ...envelope, raw: { ...envelope.raw, sourceBytes: null } }),
      raw: {
        card: clone(envelope.raw.card), sourceBlob,
        containerEntries: clone(envelope.raw.containerEntries || []), extensions: clone(envelope.raw.extensions || {}),
      },
    },
  } : null;
  if (risu && risu.envelope.raw) delete risu.envelope.raw.sourceBytes;
  const manifest = {
    contract: CONTRACT,
    id: String(input.id || slug(input.title || envelope && envelope.source.displayName || 'simpack')),
    title: String(input.title || envelope && envelope.source.displayName || 'SimPack project'), revision: positiveInt(input.revision, 1),
    source: {
      card: { fileName: String(input.fileName || envelope && envelope.source.fileName || ''), format: String(input.sourceFormat || envelope && envelope.source.format || ''), version: String(input.sourceVersion || envelope && envelope.source.version || ''), blob: sourceBlob },
      provenance: clone(input.provenance || envelope && envelope.provenance || []),
    },
    risu,
    personas: { library: clone(input.personas || []), defaultPersonaId: input.defaultPersonaId || null, sessionBinding: clone(input.personaBinding || null) },
    prompts: { presets: clone(input.promptPresets || []), defaultPresetId: input.defaultPresetId || null, sessionBinding: clone(input.promptPresetBinding || null) },
    modules: { bindings: clone(input.moduleBindings || envelope && envelope.normalized.modules || []), installed: clone(input.installedModules || []) },
    content: { characters: clone(input.characters || envelope && envelope.normalized.character ? [input.characters || envelope.normalized.character].flat().filter(Boolean) : []), lorebooks: clone(input.lorebooks || envelope && envelope.normalized.lorebooks || []), locations: clone(input.locations || []), items: clone(input.items || []) },
    runtime: { schema: clone(input.schema || null), initialState: clone(input.initialState || input.schema && input.schema.initialState || null), screens: clone(input.screens || []), navigation: clone(input.navigation || []), options: clone(input.options || {}), featureToggles: clone(input.featureToggles || {}) },
    assets: clone(input.assets || envelope && envelope.normalized.assets || []).map(normalizeAsset),
    evidence: clone(input.evidence || []),
    compatibility: { conflicts: clone(input.conflicts || []), unsupported: clone(input.unsupported || envelope && envelope.compatibility.features.filter((item) => ['degraded', 'blocked', 'preserved'].includes(item.status)) || []) },
    migrations: { current: 2, history: clone(input.migrationHistory || []) },
  };
  const files = {};
  if (sourceBytes && sourcePath) files[sourcePath] = Uint8Array.from(sourceBytes);
  for (const file of input.files || []) addFile(files, file.path, file.bytes);
  assertSimPack(manifest, files);
  return { manifest, files };
}

function packSimPack(project) {
  const manifest = migrateSimPack(project && project.manifest || project);
  const files = project && project.files || {};
  assertSimPack(manifest, files);
  const archive = { 'manifest.json': strToU8(JSON.stringify(manifest)) };
  for (const [path, bytes] of Object.entries(files)) { assertPath(path); archive[path] = Uint8Array.from(bytes); }
  return zipSync(archive, { level: 6 });
}

function unpackSimPack(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_PACK_BYTES) throw new Error('simpack_size_limit');
  const archive = unzipSync(bytes);
  const names = Object.keys(archive);
  if (names.length > MAX_FILES) throw new Error('simpack_file_limit');
  names.forEach(assertPath);
  if (!archive['manifest.json']) throw new Error('simpack_manifest_missing');
  const manifest = migrateSimPack(JSON.parse(strFromU8(archive['manifest.json'])));
  const files = Object.fromEntries(names.filter((name) => name !== 'manifest.json').map((name) => [name, archive[name]]));
  assertSimPack(manifest, files);
  verifyBlobRefs(manifest, files);
  return { manifest, files };
}

function migrateSimPack(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('simpack_manifest_invalid');
  if (raw.contract === CONTRACT) return clone(raw);
  if (raw.contract === 'simpack/0.1') {
    const migrated = createSimPack({
      id: raw.id, title: raw.title, revision: raw.revision, sourceBytes: null,
      schema: raw.schema || raw.runtime && raw.runtime.schema,
      initialState: raw.initialState, screens: raw.screens, navigation: raw.navigation,
      characters: raw.characters, lorebooks: raw.lorebooks, items: raw.items,
      assets: raw.assets, featureToggles: raw.featureToggles,
      migrationHistory: [{ from: 1, to: 2, note: 'Normalized legacy flat project sections.' }],
    }).manifest;
    return migrated;
  }
  throw new Error('simpack_contract_unsupported');
}

function assertSimPack(manifest, files = {}) {
  if (!manifest || manifest.contract !== CONTRACT) throw new Error('simpack_contract_unsupported');
  for (const key of ['source', 'personas', 'prompts', 'modules', 'content', 'runtime', 'compatibility', 'migrations']) if (!manifest[key] || typeof manifest[key] !== 'object') throw new Error(`simpack_section_missing:${key}`);
  for (const key of ['library']) if (!Array.isArray(manifest.personas[key])) throw new Error('simpack_personas_invalid');
  if (!Array.isArray(manifest.prompts.presets) || !Array.isArray(manifest.modules.bindings) || !Array.isArray(manifest.runtime.screens) || !Array.isArray(manifest.assets)) throw new Error('simpack_array_invalid');
  if (manifest.migrations.current !== 2) throw new Error('simpack_migration_invalid');
  if (Object.keys(files).length > MAX_FILES) throw new Error('simpack_file_limit');
  return true;
}

function verifyBlobRefs(manifest, files) {
  const refs = [manifest.source.card.blob, manifest.risu && manifest.risu.envelope.raw.sourceBlob].concat(manifest.assets.map((asset) => asset.blob)).filter(Boolean);
  for (const ref of refs) {
    assertPath(ref.path);
    const bytes = files[ref.path];
    if (!(bytes instanceof Uint8Array) || bytes.length !== ref.size || sha256Hex(bytes) !== ref.sha256) throw new Error(`simpack_blob_mismatch:${ref.path}`);
  }
}

function normalizeAsset(asset, index) {
  if (asset && asset.id && Object.hasOwn(asset, 'canonical')) return asset;
  return { id: String(asset && (asset.id || asset.name) || `asset-${index}`), name: String(asset && asset.name || ''), kind: String(asset && (asset.kind || asset.type) || 'asset'), blob: asset && asset.blob || null, canonical: clone(asset && asset.canonical || {}), source: asset && asset.source || null };
}
function blobRef(path, bytes, mime) { return { path, sha256: sha256Hex(bytes), size: bytes.length, mime }; }
function addFile(files, path, bytes) { assertPath(path); if (!(bytes instanceof Uint8Array)) throw new Error(`simpack_file_invalid:${path}`); files[path] = Uint8Array.from(bytes); }
function assertPath(path) { const value = String(path || ''); if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) throw new Error(`simpack_unsafe_path:${value}`); }
function safeName(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'source.bin'; }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'simpack'; }
function positiveInt(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function clone(value) { if (value == null) return value; return JSON.parse(JSON.stringify(value)); }
function fnvHex(bytes) { let hash = 2166136261; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }

// Small synchronous SHA-256 for deterministic archive manifests in both Node
// and browsers (WebCrypto is async and would make zip assembly racy).
function sha256Hex(input) {
  const bytes = Uint8Array.from(input); const bitLength = bytes.length * 8;
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6; const data = new Uint8Array(paddedLength); data.set(bytes); data[bytes.length] = 0x80;
  const view = new DataView(data.buffer); view.setUint32(paddedLength - 4, bitLength >>> 0); view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  const h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k = Uint32Array.from([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const w = new Uint32Array(64); const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) { const s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3); const s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1)>>>0; }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i += 1) { const s1=rotr(e,6)^rotr(e,11)^rotr(e,25); const ch=(e&f)^(~e&g); const t1=(hh+s1+ch+k[i]+w[i])>>>0; const s0=rotr(a,2)^rotr(a,13)^rotr(a,22); const maj=(a&b)^(a&c)^(b&c); const t2=(s0+maj)>>>0; hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
  }
  return Array.from(h, (value) => value.toString(16).padStart(8, '0')).join('');
}

module.exports = { CONTRACT, createSimPack, packSimPack, unpackSimPack, migrateSimPack, assertSimPack, verifyBlobRefs, fnvHex, sha256Hex };
