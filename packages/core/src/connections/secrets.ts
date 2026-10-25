import { AppError } from '@adxlens/core/shared';
import { decryptToken, encryptToken, type TokenKeys } from './crypto';

/**
 * Mã hóa bí mật khác token Meta (khóa LLM tự mang, ADR-0022) bằng cùng khóa `TOKEN_ENC_KEY_V{n}`, để xoay khóa và
 * quy tắc "web chỉ mã hóa, worker giải mã" giữ một chỗ. Không ghi log giá trị rõ.
 */
export function encryptSecret(
  plain: string,
  keys: { keys: TokenKeys; current: number },
): { blob: Buffer; version: number } {
  const key = keys.keys[keys.current];
  if (!key) throw new AppError('INTERNAL', 'Thiếu khóa mã hóa');
  return { blob: encryptToken(plain, key), version: keys.current };
}

/** Chỉ gọi trong worker. */
export function decryptSecret(blob: Buffer, version: number, keys: TokenKeys): string {
  const key = keys[version];
  if (!key) throw new AppError('INTERNAL', 'Thiếu khóa giải mã');
  return decryptToken(blob, key);
}
