// `pnpm team:update` (hoặc double-click Cap-nhat-AdxLens.cmd): cập nhật BẢN TEAM TEST lên `origin/develop` mới nhất.
// Bản team chạy ở thư mục riêng (git worktree cạnh thư mục dev, vd. E:\VideCode\AdxLens-team) nên việc đang code dở ở
// thư mục dev không ảnh hưởng team. Lần đầu tự tạo worktree và copy .env.local (không in nội dung).
// Thứ tự để team gián đoạn ít nhất: build bản mới vào apps/web/.next-next trong lúc app cũ vẫn chạy → migration →
// dừng app cũ → đổi tên thư mục build → bật app mới `start-local --fast` (vài giây). Dùng chung Supabase, Redis với dev.
// Chỉ dùng ở local/dev công khai (docs/runbooks/dev-public.md), không phải production.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildStamp, DEFAULT_PM, devPublicConfig, supabaseEnvFile } from './lib/start-local.mjs';
import { formatDuration, listeningPid, needsInstall, teamDirOf } from './lib/team.mjs';

const isWin = process.platform === 'win32';
const LOCAL_URL = 'http://localhost:3000';
const APP_MARKER = '.adxlens-app.json';

const step = (msg) => console.log(`\n» ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(msg) {
  console.error(`\n✖ ${msg}\nChụp màn hình cửa sổ này gửi cho dev để được hỗ trợ.`);
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) fail(`Lệnh thất bại: ${cmd} ${args.join(' ')}`);
}
const ok = (cmd, args, opts = {}) => spawnSync(cmd, args, { shell: isWin, stdio: 'ignore', ...opts }).status === 0;
const out = (cmd, args, opts = {}) => (spawnSync(cmd, args, { encoding: 'utf8', ...opts }).stdout ?? '').trim();
async function healthy() {
  try {
    return (await fetch(`${LOCAL_URL}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function teamAppRunning(team) {
  try {
    const { pid } = JSON.parse(readFileSync(path.join(team, APP_MARKER), 'utf8'));
    return Number.isInteger(pid) && alive(pid);
  } catch {
    return false;
  }
}

if (!isWin) fail('Script này hiện chỉ hỗ trợ Windows (máy chạy bản team).');

const MAIN = path.dirname(path.resolve(out('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
const TEAM = teamDirOf(MAIN);
const inTeam = { cwd: TEAM };
console.log(`Thư mục dev:  ${MAIN}\nThư mục team: ${TEAM}`);

step('Lấy code mới nhất (origin/develop)…');
run('git', ['-C', MAIN, 'fetch', 'origin', 'develop']);
const target = out('git', ['-C', MAIN, 'rev-parse', 'origin/develop']);
if (!/^[0-9a-f]{40}$/.test(target)) fail('Không đọc được origin/develop.');

let created = false;
if (!existsSync(TEAM)) {
  step('Tạo thư mục bản team (git worktree, chỉ lần đầu)…');
  run('git', ['-C', MAIN, 'worktree', 'add', '--detach', TEAM, target]);
  created = true;
}
if (!existsSync(path.join(TEAM, '.env.local'))) {
  if (!existsSync(path.join(MAIN, '.env.local'))) fail(`Thiếu ${path.join(MAIN, '.env.local')}.`);
  // Dùng chung khóa mã hóa token, Supabase, Meta app với bản dev — copy nguyên file, không đọc / in nội dung.
  copyFileSync(path.join(MAIN, '.env.local'), path.join(TEAM, '.env.local'));
  console.log('Đã copy .env.local sang bản team.');
}

const current = out('git', ['rev-parse', 'HEAD'], inTeam);
const builtNow = existsSync(path.join(TEAM, 'apps/web/.next/BUILD_ID'));
if (current === target && builtNow && teamAppRunning(TEAM) && (await healthy())) {
  console.log(`\n✔ Bản team đã là mới nhất (${target.slice(0, 7)}) và đang chạy. Không cần cập nhật.`);
  process.exit(0);
}

// Next.js tự ghi đường dẫn thư mục build (.next-next) vào 2 file này khi build — trả lại như trong git.
const NEXT_GENERATED = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'];
const restoreGenerated = () => ok('git', ['checkout', '--', ...NEXT_GENERATED], inTeam);
restoreGenerated();
if (current !== target) {
  if (out('git', ['status', '--porcelain', '--untracked-files=no'], inTeam)) {
    fail(`Thư mục team có file bị sửa tay. Không sửa code ở ${TEAM}; hỏi dev trước khi xóa thay đổi.`);
  }
  step(`Chuyển bản team ${current.slice(0, 7)} → ${target.slice(0, 7)}…`);
  run('git', ['checkout', '--detach', target], inTeam);
}
const changed = created ? '' : out('git', ['diff', '--name-only', current, target], inTeam);
if (
  needsInstall({
    created,
    hasModules: existsSync(path.join(TEAM, 'node_modules/.modules.yaml')),
    changedFiles: changed,
  })
) {
  step('Cài phụ thuộc (pnpm install)…');
  run('pnpm', ['install', '--frozen-lockfile'], inTeam);
}

step('Build bản mới (app cũ vẫn chạy cho team dùng, khoảng 2–4 phút)…');
const nextDir = path.join(TEAM, 'apps/web/.next-next');
rmSync(nextDir, { recursive: true, force: true });
run('pnpm', ['--filter', '@adxlens/web', 'build'], { ...inTeam, env: { ...process.env, NEXT_DIST_DIR: '.next-next' } });
restoreGenerated();
// Dấu build giống start-local → khi bật lại (kể cả Mo-AdxLens.cmd) không build lại.
const stamp = buildStamp(target, out('git', ['status', '--porcelain', '--', 'apps/web', 'packages'], inTeam));
writeFileSync(path.join(nextDir, 'adxlens-build-stamp'), stamp);

step('Chromium cho PDF báo cáo (chỉ tải lần đầu)…');
if (!ok('pnpm', ['--filter', '@adxlens/worker', 'exec', 'playwright', 'install', 'chromium'], inTeam)) {
  console.log('Không cài được Chromium — xuất PDF có thể lỗi, phần còn lại vẫn chạy.');
}

step('Redis + Supabase (dùng chung với bản dev)…');
run('docker', ['compose', '-f', 'infra/docker/compose.yml', 'up', '-d', '--wait'], inTeam);
// infra/supabase/.env của bản team sinh từ .env.local của bản team. Supabase đang chạy có thể được bật từ thư mục dev
// (lần đầu) → so với file của nơi đó; chỉ khởi động lại (Auth gián đoạn ~1 phút) khi cấu hình thật sự khác.
const sbFile = (dir) => path.join(dir, 'infra/supabase/.env');
const sbNext = supabaseEnvFile(devPublicConfig(readFileSync(path.join(TEAM, '.env.local'), 'utf8')));
const readOr = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const sbPrev = readOr(sbFile(TEAM)) ?? readOr(sbFile(MAIN));
if (readOr(sbFile(TEAM)) !== sbNext) writeFileSync(sbFile(TEAM), sbNext);
const sbEnv = { changed: sbPrev !== sbNext };
const sbRunning = ok('pnpm', ['exec', 'supabase', 'status', '--workdir', 'infra'], inTeam);
if (sbRunning && sbEnv.changed) {
  console.log('Cấu hình Supabase Auth đổi — khởi động lại Supabase (dữ liệu giữ nguyên)…');
  run('pnpm', ['exec', 'supabase', 'stop', '--workdir', 'infra'], inTeam);
}
if (!sbRunning || sbEnv.changed) {
  if (!ok('pnpm', ['exec', 'supabase', 'start', '--workdir', 'infra'], inTeam)) {
    run('pnpm', ['exec', 'supabase', 'start', '--workdir', 'infra'], inTeam);
  }
}
run('pnpm', ['exec', 'supabase', 'seed', 'buckets', '--workdir', 'infra'], inTeam);

step('Migration database…');
run('pnpm', ['db:migrate'], inTeam);

step('Tài khoản PM…');
const cfg = devPublicConfig(readFileSync(path.join(TEAM, '.env.local'), 'utf8'));
if (cfg.isPublic && cfg.problems.length) fail(`Cấu hình dev công khai chưa đủ:\n  - ${cfg.problems.join('\n  - ')}`);
run('pnpm', ['seed:staff', '--', '--email', cfg.pmEmail, '--can-enable-flags'], {
  ...inTeam,
  env: { ...process.env, SEED_STAFF_PASSWORD: cfg.pmPassword },
});
if (cfg.isPublic && cfg.pmEmail !== DEFAULT_PM.email) {
  run('pnpm', ['seed:staff', '--', '--email', DEFAULT_PM.email, '--lock'], inTeam);
}

step('Chuyển sang bản mới (team gián đoạn vài giây)…');
const t0 = Date.now();
// Dừng mọi app AdxLens đang chạy trên máy (bản team cũ, hoặc bản mở từ thư mục dev) — cả cây tiến trình web + worker.
spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*start-local.mjs*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }",
  ],
  { stdio: 'ignore' },
);
for (let i = 0; i < 20; i++) {
  const pid = listeningPid(out('netstat', ['-ano', '-p', 'TCP']), 3000);
  if (!pid) break;
  if (i === 10) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(500);
}
const webDir = path.join(TEAM, 'apps/web');
// Windows có thể còn giữ file vài trăm ms sau khi tiến trình bị dừng → thử lại.
const swap = async (from, to) => {
  for (let i = 0; ; i++) {
    try {
      renameSync(path.join(webDir, from), path.join(webDir, to));
      return;
    } catch (e) {
      if (i >= 20) fail(`Không đổi tên được ${from} → ${to}: ${e instanceof Error ? e.message : e}`);
      await sleep(300);
    }
  }
};
rmSync(path.join(webDir, '.next-old'), { recursive: true, force: true });
if (existsSync(path.join(webDir, '.next'))) await swap('.next', '.next-old');
await swap('.next-next', '.next');
// Cửa sổ riêng cho bản team: đóng cửa sổ đó = tắt app.
spawn('cmd.exe', ['/c', 'start "AdxLens (ban team)" cmd /k "chcp 65001 >nul & node scripts\\start-local.mjs --fast"'], {
  cwd: TEAM,
  detached: true,
  stdio: 'ignore',
  windowsVerbatimArguments: true,
}).unref();
const until = Date.now() + 120_000;
while (!(await healthy())) {
  if (Date.now() > until)
    fail(`Bản mới chưa lên sau 2 phút. Xem cửa sổ "AdxLens (ban team)" hoặc mở ${TEAM}\\Mo-AdxLens.cmd.`);
  await sleep(500);
}
const down = Date.now() - t0;

const log =
  current === target ? '' : out('git', ['log', '--no-merges', '--format=  - %s', `${current}..${target}`], inTeam);
console.log(`
==================================================================
  ✔ Bản team đã cập nhật: ${target.slice(0, 7)} — gián đoạn ${formatDuration(down)}
  Địa chỉ: ${cfg.appUrl}
  Cửa sổ "AdxLens (ban team)" là app đang chạy — đóng cửa sổ đó = tắt app.
${log ? `  Thay đổi mới:\n${log.split('\n').slice(0, 20).join('\n')}\n` : ''}==================================================================
`);
