import { existsSync } from 'node:fs';
import path from 'node:path';

/** Nạp .env.local (nếu có) và đặt giá trị an toàn cho test. Không bao giờ dùng giá trị production. */
export function loadTestEnv(): void {
  const file = path.resolve(import.meta.dirname, '..', '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
  process.env.APP_ENV = 'test';
  process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
  process.env.META_MOCK = '1';
  process.env.INTERNAL_SIGNING_SECRET ??= 'test-signing-secret-0123456789abcdef';
  process.env.TOKEN_ENC_KEY_V1 ??= Buffer.alloc(32, 1).toString('base64');
  process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
}
