// `pnpm killswitch -- on|off [--workspace <id>] --reason "<lý do>"` — kill switch DỰ PHÒNG khi giao diện không
// dùng được (ADR-0008 mục 7, L3 17.2). Không có --workspace = toàn cục. Bật → hủy mọi hành động đang chờ.
// Không chạy ở production từ máy dev (CLAUDE.md quy tắc 9): PM chạy trên môi trường được cấp quyền.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setGlobalKillSwitch, setWorkspaceKillSwitchSystem } from '@adxlens/core/ops';
import { createDb } from '@adxlens/db';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function arg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const mode = args[0];
  if (mode !== 'on' && mode !== 'off') throw new Error('Dùng: on|off [--workspace <id>] --reason "<lý do>"');
  const reason = (arg('--reason', args) ?? '').trim();
  if (reason.length < 5) throw new Error('Cần --reason (≥ 5 ký tự).');
  const workspace = arg('--workspace', args);
  if (workspace && !/^[0-9a-f-]{36}$/.test(workspace)) throw new Error('workspace id không hợp lệ');
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL');
  const { db, close } = createDb(process.env.DATABASE_URL);
  try {
    const active = mode === 'on';
    const r = workspace
      ? await setWorkspaceKillSwitchSystem(db, workspace, { active, reason: `CLI: ${reason}` })
      : await setGlobalKillSwitch(db, { active, reason: `CLI: ${reason}`, changedBy: null });
    console.log(
      `Kill switch ${workspace ? `workspace ${workspace}` : 'toàn cục'}: ${mode.toUpperCase()} — hủy ${r.canceled} hành động đang chờ`,
    );
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
