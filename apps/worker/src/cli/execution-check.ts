// `pnpm execution:check -- <ad_id> <adset_id>` — test tích hợp lớp ghi Meta trên tài khoản TEST (ADR-0008 mục 9,
// L3 14). Chỉ chạy ở local/staging; cần META_WRITE_TEST_ACCOUNTS (danh sách act_… cho phép) và
// META_TEST_WRITE_TOKEN (token của người dùng test, chỉ staging). Không bao giờ in token.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createMetaWriter, runWriteSelfTest } from '@adxlens/core/execution';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const env = process.env.APP_ENV ?? 'local';
  if (env !== 'local' && env !== 'staging') throw new Error('Chỉ chạy ở local hoặc staging (CLAUDE.md quy tắc 9).');
  const [adId, adsetId] = process.argv.slice(2).filter((a) => a !== '--');
  if (!adId || !adsetId) throw new Error('Cần <ad_id> <adset_id> trên tài khoản test.');
  const allowed = (process.env.META_WRITE_TEST_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const mock = process.env.META_MOCK === '1' || process.env.META_MOCK === 'true';
  const token = mock ? 'mock-write-selftest' : process.env.META_TEST_WRITE_TOKEN;
  if (!token) throw new Error('Thiếu META_TEST_WRITE_TOKEN.');
  const writer = createMetaWriter({
    mock,
    apiVersion: process.env.META_API_VERSION ?? 'v24.0',
    appSecret: process.env.META_APP_SECRET,
  });
  const steps = await runWriteSelfTest(writer, token, { allowedAccounts: allowed, adId, adsetId });
  for (const s of steps) console.log(`${s.ok ? 'ĐẠT ' : 'LỖI '} ${s.action.padEnd(28)} ${s.target}  ${s.detail}`);
  if (steps.some((s) => !s.ok)) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
