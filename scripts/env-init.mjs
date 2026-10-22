// `pnpm env:init`: tạo .env.local từ .env.example, sinh khóa ngẫu nhiên, lấy key Supabase local.
// Không ghi đè .env.local đã có (trừ khi truyền --force).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const force = process.argv.includes('--force');
if (existsSync('.env.local') && !force) {
  console.log('.env.local đã tồn tại; không ghi đè (dùng --force để tạo lại).');
  process.exit(0);
}

let text = readFileSync('.env.example', 'utf8');
const set = (key, value) => {
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
};

set('INTERNAL_SIGNING_SECRET', randomBytes(32).toString('base64url'));
set('TOKEN_ENC_KEY_V1', randomBytes(32).toString('base64'));

const status = spawnSync(
  'pnpm',
  ['exec', 'supabase', 'status', '--workdir', 'infra', '-o', 'env'],
  {
    shell: process.platform === 'win32',
    encoding: 'utf8',
  },
);
if (status.status === 0) {
  const vars = Object.fromEntries(
    status.stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  if (vars.ANON_KEY) {
    set('SUPABASE_ANON_KEY', vars.ANON_KEY);
    set('NEXT_PUBLIC_SUPABASE_ANON_KEY', vars.ANON_KEY);
  }
  if (vars.SERVICE_ROLE_KEY) set('SUPABASE_SERVICE_ROLE_KEY', vars.SERVICE_ROLE_KEY);
  console.log('Đã lấy key Supabase local.');
} else {
  console.log(
    'Supabase local chưa chạy: key Supabase để trống. Chạy `pnpm dev` một lần rồi `pnpm env:init --force`.',
  );
}

writeFileSync('.env.local', text);
console.log('Đã tạo .env.local (khóa mã hóa và secret được sinh ngẫu nhiên).');
