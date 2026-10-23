import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hóa token Meta AES-256-GCM (L3 5.4). Định dạng: iv(12) | tag(16) | ciphertext.
 * `token_key_version` chọn khóa TOKEN_ENC_KEY_V{n}, cho phép xoay khóa.
 */
export type TokenKeys = Record<number, Buffer>;

export function keysFromEnv(env: { TOKEN_ENC_KEY_V1: string; TOKEN_ENC_KEY_V2?: string | undefined }): {
  keys: TokenKeys;
  current: number;
} {
  const keys: TokenKeys = { 1: Buffer.from(env.TOKEN_ENC_KEY_V1, 'base64') };
  if (env.TOKEN_ENC_KEY_V2) keys[2] = Buffer.from(env.TOKEN_ENC_KEY_V2, 'base64');
  for (const k of Object.values(keys)) if (k.length !== 32) throw new Error('Khóa mã hóa token phải 32 byte');
  return { keys, current: env.TOKEN_ENC_KEY_V2 ? 2 : 1 };
}

export function encryptToken(plain: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decryptToken(blob: Buffer, key: Buffer): string {
  if (blob.length < 29) throw new Error('Token mã hóa không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}
