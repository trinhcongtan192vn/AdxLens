import { existsSync } from 'node:fs';
import path from 'node:path';
import { runMigrations } from '@adxlens/db/migrate';

/** Đảm bảo database dev đã migrate trước khi chạy E2E. */
export default async function globalSetup(): Promise<void> {
  const env = path.resolve(import.meta.dirname, '../../../.env.local');
  if (existsSync(env)) process.loadEnvFile(env);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL chưa cấu hình');
  await runMigrations(process.env.DATABASE_URL);
}
