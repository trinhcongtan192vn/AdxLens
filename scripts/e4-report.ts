// `pnpm e4:report -- --workspace <uuid> [--days 30]`
// Báo cáo E4 (L3 mục 17): độ lệch đối chiếu và mức phủ dữ liệu theo tài khoản của MỘT workspace, in
// Markdown. Chỉ đọc. Chạy ở local/staging; không chạy ở production (CLAUDE.md quy tắc 9).
import { existsSync } from 'node:fs';
import { createDb } from '@adxlens/db';
import { coverageMarkdown, dataCoverageReport } from '@adxlens/core/reconciliation';
import { addDays, localDate } from '@adxlens/core/shared';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.APP_ENV === 'production') {
  console.error('Không chạy báo cáo E4 ở production (CLAUDE.md quy tắc 9).');
  process.exit(1);
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const workspaceId = arg('workspace');
const days = Number(arg('days') ?? 30);
if (!workspaceId || !/^[0-9a-f-]{36}$/.test(workspaceId) || !(days >= 1 && days <= 90)) {
  console.error('Cần --workspace <uuid>, --days 1–90 (mặc định 30).');
  process.exit(1);
}

async function main(ws: string) {
  const { db, close } = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres');
  const to = addDays(localDate(new Date(), 'Asia/Ho_Chi_Minh'), -1);
  const range = { from: addDays(to, -(days - 1)), to };
  try {
    console.log(coverageMarkdown(await dataCoverageReport({ db, workspaceId: ws }, range), range));
  } finally {
    await close();
  }
}

void main(workspaceId);
