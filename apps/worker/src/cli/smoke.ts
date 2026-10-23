// `pnpm smoke -- <base_url>` — smoke test sau deploy (L2 11.2 `deploy_smoke_failed`): kiểm vài trang/API công
// khai; lỗi → mở sự cố P1 (khi có DATABASE_URL) và thoát mã 1 để pipeline dừng / PM rollback. Không cần đăng nhập.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { recordDeploySmoke } from '@adxlens/core/ops';
import { createDb } from '@adxlens/db';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const CHECKS: { path: string; expect: (res: Response, body: string) => boolean }[] = [
  { path: '/api/health', expect: (r) => r.status === 200 },
  { path: '/', expect: (r) => r.status === 200 },
  { path: '/pricing', expect: (r, b) => r.status === 200 && b.includes('Growth') },
  { path: '/r/demo', expect: (r) => r.status === 200 },
  { path: '/login', expect: (r) => r.status === 200 },
];

async function main() {
  const base = (
    process.argv.slice(2).find((a) => a !== '--') ??
    process.env.APP_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const failures: string[] = [];
  for (const c of CHECKS) {
    try {
      const res = await fetch(`${base}${c.path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      const body = await res.text();
      if (!c.expect(res, body)) failures.push(`${c.path} → ${res.status}`);
    } catch (e) {
      failures.push(`${c.path} → ${e instanceof Error ? e.name : 'lỗi'}`);
    }
  }
  for (const f of failures) console.error(`LỖI ${f}`);
  console.log(failures.length ? `Smoke thất bại (${failures.length})` : `Smoke đạt (${CHECKS.length} kiểm tra)`);
  if (process.env.DATABASE_URL) {
    const { db, close } = createDb(process.env.DATABASE_URL);
    await recordDeploySmoke(db, { appVersion: process.env.APP_VERSION ?? 'local', ok: !failures.length, failures });
    await close();
  }
  if (failures.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
