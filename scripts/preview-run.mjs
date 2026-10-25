// Chạy BẢN XEM TRƯỚC của PM (web + worker) ở http://localhost:3100 — do scripts/preview.mjs mở trong cửa sổ riêng.
// Dùng chung Supabase (database, tài khoản) với bản team; Redis db 1 riêng và worker KHÔNG chạy job định kỳ, nên không
// làm trùng việc của bản team. Đóng cửa sổ = tắt bản xem trước.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { PREVIEW_PORT, previewEnv } from './lib/team.mjs';

const isWin = process.platform === 'win32';
const env = { ...process.env, ...previewEnv(process.env.REDIS_URL) };
const children = [];
function start(args) {
  const child = spawn('pnpm', args, { stdio: 'inherit', shell: isWin, env });
  children.push(child);
  child.on('exit', (code) => {
    for (const c of children) {
      if (c !== child && c.exitCode === null) {
        if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
        else c.kill();
      }
    }
    process.exit(code ?? 0);
  });
}

start(['--filter', '@adxlens/web', 'exec', 'next', 'start', '--port', String(PREVIEW_PORT)]);
start(['--filter', '@adxlens/worker', 'exec', 'tsx', '--env-file-if-exists=../../.env.local', 'src/main.ts']);
writeFileSync('.adxlens-preview-app.json', JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
process.on('exit', () => rmSync('.adxlens-preview-app.json', { force: true }));
console.log(`
==================================================================
  BẢN XEM TRƯỚC (chỉ máy này): http://localhost:${PREVIEW_PORT}
  Dùng chung dữ liệu với bản team; job định kỳ không chạy ở đây.
  Test xong → bấm Cap-nhat-AdxLens.cmd để đưa ĐÚNG bản này lên team.
  Tắt: đóng cửa sổ này.
==================================================================
`);
