/**
 * Key vault — encrypt/decrypt API keys at rest with a user passphrase.
 * Uses Web Crypto (PBKDF2 + AES-GCM). Keys are never logged or bundled.
 * The passphrase is held in memory only; on lock, decrypted keys are cleared.
 */

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveKey(passphrase: string, salt: Uint8Array | BufferSource): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

export async function encryptSecret(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  const blob: EncryptedBlob = {
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(cipher)),
  };
  return JSON.stringify(blob);
}

export async function decryptSecret(encryptedJson: string, passphrase: string): Promise<string> {
  const blob = JSON.parse(encryptedJson) as EncryptedBlob;
  const salt = fromBase64(blob.salt);
  const iv = fromBase64(blob.iv);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    fromBase64(blob.ciphertext) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** Return true if the blob can be decrypted with the passphrase (no exceptions leaked). */
export async function canDecrypt(encryptedJson: string, passphrase: string): Promise<boolean> {
  try {
    await decryptSecret(encryptedJson, passphrase);
    return true;
  } catch {
    return false;
  }
}

function base64(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
