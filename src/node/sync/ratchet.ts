/**
 * Forward-secrecy primitives for off-chain sync channels.
 *
 * Model:
 * 1) Establish shared secret using ECDH (P-256) on ephemeral/static keys.
 * 2) Derive directional chain keys via HKDF.
 * 3) For each message: encrypt with current chain key, then ratchet (one-way HMAC).
 *
 * This gives practical forward secrecy for prior messages if current chain keys leak.
 */

export type FsEnvelope = {
  seq: number;
  ivB64: string;
  ciphertextB64: string;
};

export type RatchetState = {
  sendSeq: number;
  recvSeq: number;
  sendKey: Uint8Array;
  recvKey: Uint8Array;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
}

export async function exportPubSpkiB64(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return b64(new Uint8Array(spki));
}

export async function importPubSpkiB64(spkiB64: string): Promise<CryptoKey> {
  const raw = b64d(spkiB64);
  return await crypto.subtle.importKey(
    "spki",
    toArrayBuffer(raw),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

export async function establishRatchet(
  localPrivate: CryptoKey,
  remotePublic: CryptoKey,
  context = "token-node-sync-v1",
): Promise<RatchetState> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePublic },
    localPrivate,
    256,
  );
  const shared = new Uint8Array(bits);
  const root = await hkdf(shared, enc.encode(context), enc.encode("root"), 64);
  const sendKey = root.slice(0, 32);
  const recvKey = root.slice(32, 64);
  return { sendSeq: 0, recvSeq: 0, sendKey, recvKey };
}

export async function sealWithRatchet(
  state: RatchetState,
  payload: unknown,
  aad: Uint8Array = new Uint8Array(),
): Promise<FsEnvelope> {
  const plaintext = enc.encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAes(state.sendKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
    key,
    toArrayBuffer(plaintext),
  );
  state.sendKey = await nextChainKey(state.sendKey);
  const out: FsEnvelope = {
    seq: state.sendSeq++,
    ivB64: b64(iv),
    ciphertextB64: b64(new Uint8Array(ciphertext)),
  };
  return out;
}

export async function openWithRatchet<T = unknown>(
  state: RatchetState,
  envelope: FsEnvelope,
  aad: Uint8Array = new Uint8Array(),
): Promise<T> {
  if (envelope.seq !== state.recvSeq) {
    throw new Error(`unexpected sequence: got=${envelope.seq} expected=${state.recvSeq}`);
  }
  const key = await importAes(state.recvKey);
  const iv = b64d(envelope.ivB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
    key,
    toArrayBuffer(b64d(envelope.ciphertextB64)),
  );
  state.recvKey = await nextChainKey(state.recvKey);
  state.recvSeq++;
  return JSON.parse(dec.decode(new Uint8Array(plaintext))) as T;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

async function nextChainKey(k: Uint8Array): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(k),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const out = await crypto.subtle.sign("HMAC", hmacKey, toArrayBuffer(enc.encode("ratchet-next")));
  return new Uint8Array(out);
}

async function importAes(key: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", toArrayBuffer(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function b64d(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

