import type { Env } from './env';
import { getTokenEncryptionSecret } from './env';

// AES-GCM 加密社群 access token,金鑰由 secret 經 SHA-256 衍生

async function deriveKey(env: Env): Promise<CryptoKey> {
  const secret = getTokenEncryptionSecret(env);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptToken(env: Env, plaintext: string): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptToken(env: Env, encrypted: string): Promise<string> {
  const [ivB64, cipherB64] = encrypted.split('.');
  if (!ivB64 || !cipherB64) throw new Error('無效的加密格式');
  const key = await deriveKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) as BufferSource },
    key,
    fromBase64(cipherB64) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** 遮罩顯示 token,只露出前 4 後 4 碼 */
export function maskToken(token: string): string {
  if (token.length <= 12) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
