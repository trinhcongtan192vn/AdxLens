// `pnpm drill [-- --cleanup]` — diễn tập 3 sự cố (Meta rate limit, đối chiếu lệch, thực thi lỗi) trên DB LOCAL với
// Meta giả (implementation-guide B9). Xem kết quả ở /admin/incidents; `--cleanup` xóa workspace diễn tập và đóng sự cố.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { keysFromEnv } from '@adxlens/core/connections';
import { createDb } from '@adxlens/db';
import { cleanupDrill, runIncidentDrill } from '../drill';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('Chỉ chạy ở local.');
  if (!process.env.DATABASE_URL || !process.env.TOKEN_ENC_KEY_V1)
    throw new Error('Thiếu DATABASE_URL / TOKEN_ENC_KEY_V1');
  const cleanup = process.argv.includes('--cleanup');
  const keys = keysFromEnv({
    TOKEN_ENC_KEY_V1: process.env.TOKEN_ENC_KEY_V1,
    TOKEN_ENC_KEY_V2: process.env.TOKEN_ENC_KEY_V2,
  });
  const { db, close } = createDb(process.env.DATABASE_URL);
  try {
    const { workspaceId, steps } = await runIncidentDrill(db, { keys });
    for (const s of steps) console.log(`${s.ok ? 'ĐẠT' : 'LỖI'}  ${s.step.padEnd(26)} ${s.detail}`);
    if (cleanup) {
      await cleanupDrill(db, workspaceId);
      console.log('Đã dọn workspace diễn tập và đóng sự cố.');
    } else {
      console.log(`Workspace diễn tập: ${workspaceId} — xem /admin/incidents; chạy lại với --cleanup để dọn.`);
    }
    if (steps.some((s) => !s.ok)) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
