// `pnpm start:local` (hoặc double-click Mo-AdxLens.cmd): mở app ở local để PM test thủ công, không cần gõ lệnh.
// Bật Docker Desktop nếu chưa chạy → cài phụ thuộc → Redis + Supabase → .env.local → migration → tài khoản PM
// (staff, bật cờ được) → build web nếu code đổi → web + worker bản build (Meta, Stripe, PayOS giả) → mở trình duyệt.
// Chỉ dùng ở local. `PUBLIC_DEV_APP_URL` trong .env.local = chế độ dev công khai cho team test qua domain
// (docs/runbooks/dev-public.md): bắt buộc mật khẩu PM riêng + SMTP thật, Supabase Auth theo domain dev.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import {
  buildStamp,
  DEFAULT_PM,
  devPublicConfig,
  fillSupabaseKeys,
  missingSupabaseKeys,
  parseStatusEnv,
} from './lib/start-local.mjs';
import { syncSupabaseEnv } from './lib/supabase-env.mjs';

const isWin = process.platform === 'win32';
// Địa chỉ trên chính máy này (kiểm tra app đã lên); địa chỉ cho người dùng lấy từ cấu hình (localhost hoặc domain dev).
const LOCAL_URL = 'http://localhost:3000';
const readCfg = () => devPublicConfig(existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '');
let cfg = readCfg();
// `--dev`: chạy `pnpm dev` (hot reload cho dev sửa code). Mặc định chạy bản build để PM test nhanh.
const DEV_MODE = process.argv.includes('--dev');

const step = (msg) => console.log(`\n» ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cmd, args) => spawnSync(cmd, args, { shell: isWin, stdio: 'ignore' }).status === 0;
function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: isWin,
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  if (r.status !== 0) fail(`Lệnh thất bại: ${cmd} ${args.join(' ')}`);
}
function fail(msg) {
  console.error(`\n✖ ${msg}\nChụp màn hình cửa sổ này gửi cho dev để được hỗ trợ.`);
  process.exit(1);
}
async function healthy() {
  try {
    return (await fetch(`${LOCAL_URL}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}
function openBrowser(url) {
  if (isWin) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
function mockLine() {
  let env = '';
  try {
    env = readFileSync('.env.local', 'utf8');
  } catch {
    // chưa có .env.local → coi như bản giả
  }
  const metaReal = /^META_MOCK=0\s*$/m.test(env);
  return metaReal
    ? 'Meta: THẬT (META_MOCK=0) — đọc dữ liệu từ tài khoản quảng cáo đã kết nối. Stripe, PayOS: bản giả.'
    : 'Meta, Stripe, PayOS đang chạy bản GIẢ — không đụng dữ liệu thật.';
}
function printInfo() {
  // Không in mật khẩu PM khi đã đặt riêng (PM_PASSWORD trong .env.local).
  const pass = cfg.pmPasswordIsDefault ? cfg.pmPassword : '(PM_PASSWORD trong .env.local)';
  const mail = cfg.isPublic
    ? `Email: gửi thật qua SMTP (${cfg.smtp.host}) — xem log ở dashboard Resend`
    : 'Email local (xác minh, mời, báo cáo):   http://127.0.0.1:54324';
  const mode = cfg.isPublic
    ? `  DEV CÔNG KHAI cho team test: ${cfg.appUrl} (Cloudflare Tunnel) — docs/runbooks/dev-public.md\n`
    : '';
  console.log(`
==================================================================
${mode}  AdxLens đã chạy:  ${cfg.appUrl}
  Tài khoản PM (staff, bật cờ ở /admin):  ${cfg.pmEmail}  /  ${pass}
  ${mail}
  Database (Supabase Studio):            http://127.0.0.1:54323
  ${mockLine()}
  Hướng dẫn test: docs/implementation-guide.md Phần 4, docs/CHANGELOG.md
  Tắt app: đóng cửa sổ này (hoặc Ctrl+C).
==================================================================
`);
}

if (await healthy()) {
  console.log('App đang chạy sẵn — mở trình duyệt.');
  printInfo();
  openBrowser(`${cfg.appUrl}/login`);
  process.exit(0);
}

step('Kiểm tra Docker…');
if (!ok('docker', ['info'])) {
  const exe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
  if (isWin && existsSync(exe)) {
    console.log('Docker chưa chạy — đang mở Docker Desktop (có thể mất 1–2 phút)…');
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  } else {
    fail('Docker chưa chạy. Mở Docker Desktop rồi chạy lại.');
  }
  const until = Date.now() + 180_000;
  while (!ok('docker', ['info'])) {
    if (Date.now() > until) fail('Docker Desktop chưa sẵn sàng sau 3 phút. Mở Docker Desktop, đợi xong rồi chạy lại.');
    await sleep(5000);
  }
}

const modules = 'node_modules/.modules.yaml';
if (!existsSync(modules) || statSync('pnpm-lock.yaml').mtimeMs > statSync(modules).mtimeMs) {
  step('Cài phụ thuộc (pnpm install)…');
  run('pnpm', ['install']);
}

step('Cấu hình .env.local…');
if (!existsSync('.env.local')) run('pnpm', ['env:init']);
cfg = readCfg();
if (cfg.isPublic) {
  console.log(`Chế độ dev công khai: ${cfg.appUrl}`);
  if (cfg.problems.length) {
    fail(
      `Chưa mở ra ngoài được — sửa trong .env.local (docs/runbooks/dev-public.md mục 3–4):\n  - ${cfg.problems.join('\n  - ')}`,
    );
  }
}

step('Redis + Supabase local…');
run('docker', ['compose', '-f', 'infra/docker/compose.yml', 'up', '-d', '--wait']);
// Supabase Auth theo chế độ (localhost / domain dev) qua infra/supabase/.env; đổi chế độ → khởi động lại Supabase.
const sbEnv = syncSupabaseEnv();
const sbRunning = ok('pnpm', ['exec', 'supabase', 'status', '--workdir', 'infra']);
if (sbRunning && sbEnv.changed) {
  console.log('Cấu hình Supabase Auth đổi — khởi động lại Supabase (dữ liệu giữ nguyên)…');
  run('pnpm', ['exec', 'supabase', 'stop', '--workdir', 'infra']);
}
if (!sbRunning || sbEnv.changed) run('pnpm', ['exec', 'supabase', 'start', '--workdir', 'infra']);
run('pnpm', ['exec', 'supabase', 'seed', 'buckets', '--workdir', 'infra']);

const envText = readFileSync('.env.local', 'utf8');
if (missingSupabaseKeys(envText).length) {
  const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '--workdir', 'infra', '-o', 'env'], {
    shell: isWin,
    encoding: 'utf8',
  });
  writeFileSync('.env.local', fillSupabaseKeys(envText, parseStatusEnv(status.stdout ?? '')));
  if (missingSupabaseKeys(readFileSync('.env.local', 'utf8')).length) fail('Không lấy được key Supabase local.');
  console.log('Đã điền key Supabase local.');
}

step('Migration database…');
run('pnpm', ['db:migrate']);

step(`Tài khoản PM ${cfg.pmEmail}…`);
// Mật khẩu qua biến môi trường, không đặt trên dòng lệnh.
run('pnpm', ['seed:staff', '--', '--email', cfg.pmEmail, '--can-enable-flags'], {
  SEED_STAFF_PASSWORD: cfg.pmPassword,
});
if (cfg.isPublic && cfg.pmEmail !== DEFAULT_PM.email) {
  // Mật khẩu PM mặc định ai cũng biết (nằm trong tài liệu) → khóa trước khi mở ra ngoài.
  run('pnpm', ['seed:staff', '--', '--email', DEFAULT_PM.email, '--lock']);
}

step('Chromium cho PDF báo cáo (chỉ tải lần đầu)…');
if (!ok('pnpm', ['--filter', '@adxlens/worker', 'exec', 'playwright', 'install', 'chromium'])) {
  console.log('Không cài được Chromium — xuất PDF có thể lỗi, phần còn lại vẫn chạy.');
}

const children = [];
// Dev công khai: link trong email / báo cáo theo domain dev, link logo / PDF qua hostname Supabase của tunnel. Biến truyền
// vào tiến trình con được ưu tiên hơn giá trị trong .env.local.
const childEnv = cfg.isPublic
  ? { APP_URL: cfg.appUrl, PUBLIC_REPORT_URL: `${cfg.appUrl}/r`, STORAGE_PUBLIC_URL: cfg.supabasePublicUrl }
  : {};
function startChild(args) {
  const child = spawn('pnpm', args, { stdio: 'inherit', shell: isWin, env: { ...process.env, ...childEnv } });
  children.push(child);
  child.on('exit', (code) => {
    // Một tiến trình dừng → dừng cả app (web không có worker thì đồng bộ, báo cáo không chạy).
    for (const c of children) {
      if (c !== child && c.exitCode === null) {
        if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
        else c.kill();
      }
    }
    process.exit(code ?? 0);
  });
}

if (DEV_MODE) {
  step('Bật web + worker ở chế độ dev (lần đầu mở mỗi trang chậm do biên dịch)…');
  startChild(['dev']);
} else {
  // Chế độ test (mặc định): bản build như production — chuyển tab nhanh, không biên dịch từng trang lần đầu mở.
  const git = (args) => spawnSync('git', args, { encoding: 'utf8' }).stdout ?? '';
  const stamp = buildStamp(
    git(['rev-parse', 'HEAD']).trim(),
    git(['status', '--porcelain', '--', 'apps/web', 'packages']),
  );
  const stampFile = 'apps/web/.next/adxlens-build-stamp';
  const built = existsSync('apps/web/.next/BUILD_ID') && existsSync(stampFile);
  if (!stamp || !built || readFileSync(stampFile, 'utf8') !== stamp) {
    step('Build web (chỉ khi code đổi, khoảng 2–4 phút)…');
    run('pnpm', ['--filter', '@adxlens/web', 'build']);
    if (stamp) writeFileSync(stampFile, stamp);
  } else {
    console.log('\nBản build web còn mới — bỏ qua build.');
  }
  step('Bật web + worker…');
  startChild(['--filter', '@adxlens/web', 'start']);
  startChild(['--filter', '@adxlens/worker', 'exec', 'tsx', '--env-file-if-exists=../../.env.local', 'src/main.ts']);
}

const until = Date.now() + 300_000;
while (!(await healthy())) {
  if (Date.now() > until) fail('Web chưa lên sau 5 phút. Xem log phía trên.');
  await sleep(3000);
}
if (cfg.isPublic) {
  step(`Kiểm tra tunnel ${cfg.appUrl}…`);
  let reachable = false;
  try {
    reachable = (await fetch(`${cfg.appUrl}/api/health`, { signal: AbortSignal.timeout(10_000) })).ok;
  } catch {
    reachable = false;
  }
  console.log(
    reachable
      ? 'Tunnel thông — team vào được.'
      : 'Chưa vào được qua domain: kiểm tra service cloudflared và public hostname (docs/runbooks/dev-public.md mục 1.2).',
  );
}
printInfo();
openBrowser(`${cfg.appUrl}/login`);
