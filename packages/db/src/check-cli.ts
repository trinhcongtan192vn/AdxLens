// `pnpm db:check`: thất bại nếu schema Drizzle có thay đổi chưa sinh migration.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIGRATIONS_DIR } from './migrate';

const tmp = mkdtempSync(path.join(tmpdir(), 'adxlens-dbcheck-'));
try {
  if (existsSync(MIGRATIONS_DIR)) cpSync(MIGRATIONS_DIR, tmp, { recursive: true });
  const before = new Set(readdirSync(tmp).filter((f) => f.endsWith('.sql')));
  const r = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate'], {
    env: { ...process.env, DRIZZLE_OUT: tmp },
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    process.exit(r.status ?? 1);
  }
  const added = readdirSync(tmp).filter((f) => f.endsWith('.sql') && !before.has(f));
  if (added.length) {
    process.stderr.write(
      `Schema có thay đổi chưa sinh migration (${added.join(', ')}). Chạy: pnpm db:generate\n`,
    );
    process.exit(1);
  }
  process.stdout.write('db:check: migration khớp schema.\n');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
