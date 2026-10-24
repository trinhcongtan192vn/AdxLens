// `pnpm dev`: bật Redis (Docker Compose) + Supabase local, rồi chạy web và worker.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { syncSupabaseEnv } from './lib/supabase-env.mjs';

const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) {
    console.error(`\nLệnh thất bại: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync('.env.local')) {
  console.error('Thiếu .env.local. Chạy: pnpm env:init (hoặc copy .env.example thành .env.local).');
  process.exit(1);
}

console.log('» Redis (Docker Compose)…');
run('docker', ['compose', '-f', 'infra/docker/compose.yml', 'up', '-d', '--wait']);

console.log('» Supabase local (Postgres, Auth, Storage, Mailpit)…');
// infra/supabase/.env cho env(...) trong config.toml (localhost hoặc domain dev công khai).
const sbEnv = syncSupabaseEnv();
const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '--workdir', 'infra'], {
  shell: isWin,
  stdio: 'ignore',
});
if (status.status === 0 && sbEnv.changed) run('pnpm', ['exec', 'supabase', 'stop', '--workdir', 'infra']);
if (status.status !== 0 || sbEnv.changed) run('pnpm', ['exec', 'supabase', 'start', '--workdir', 'infra']);

console.log('» Storage buckets (brand, reports, creatives — infra/supabase/config.toml)…');
run('pnpm', ['exec', 'supabase', 'seed', 'buckets', '--workdir', 'infra']);

console.log('» Migration database…');
run('pnpm', ['db:migrate']);

console.log('» Web + worker…');
const child = spawn('pnpm', ['turbo', 'run', 'dev', '--filter=./apps/*'], {
  stdio: 'inherit',
  shell: isWin,
});
child.on('exit', (code) => process.exit(code ?? 0));
