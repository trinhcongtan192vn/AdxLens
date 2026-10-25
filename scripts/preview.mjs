// `pnpm preview` (hoặc double-click Xem-truoc-AdxLens.cmd): BẢN XEM TRƯỚC cho PM test `origin/develop` mới nhất trên
// máy mình (http://localhost:3100) TRƯỚC khi đưa lên bản team. Chạy ở thư mục riêng (git worktree, vd.
// E:\VideCode\AdxLens-preview); ghi commit đã xem trước để Cap-nhat-AdxLens.cmd đưa đúng commit đó lên team.
// Dùng chung Supabase với bản team → migration mới áp vào database chung ngay lúc này (chỉ thêm bảng / cột).
// Chỉ dùng ở local / dev công khai, không phải production.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildStamp } from './lib/start-local.mjs';
import { needsInstall, PREVIEW_PORT, previewDirOf } from './lib/team.mjs';

const isWin = process.platform === 'win32';
const URL_ = `http://localhost:${PREVIEW_PORT}`;
/** Commit PM đã xem trước — đọc bởi scripts/team.mjs. */
export const PREVIEW_MARKER = '.adxlens-preview.json';

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
    return (await fetch(`${URL_}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

if (!isWin) fail('Script này hiện chỉ hỗ trợ Windows.');

const MAIN = path.dirname(path.resolve(out('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
const DIR = previewDirOf(MAIN);
const inDir = { cwd: DIR };
console.log(`Thư mục dev:        ${MAIN}\nThư mục xem trước:  ${DIR}`);

step('Lấy code mới nhất (origin/develop)…');
run('git', ['-C', MAIN, 'fetch', 'origin', 'develop']);
const target = out('git', ['-C', MAIN, 'rev-parse', 'origin/develop']);
if (!/^[0-9a-f]{40}$/.test(target)) fail('Không đọc được origin/develop.');

let created = false;
if (!existsSync(DIR)) {
  step('Tạo thư mục bản xem trước (git worktree, chỉ lần đầu)…');
  run('git', ['-C', MAIN, 'worktree', 'add', '--detach', DIR, target]);
  created = true;
}
if (!existsSync(path.join(DIR, '.env.local'))) {
  if (!existsSync(path.join(MAIN, '.env.local'))) fail(`Thiếu ${path.join(MAIN, '.env.local')}.`);
  // Dùng chung khóa mã hóa, Supabase, Meta app — copy nguyên file, không đọc / in nội dung.
  copyFileSync(path.join(MAIN, '.env.local'), path.join(DIR, '.env.local'));
}

// Tắt bản xem trước cũ (nếu đang chạy) trước khi đổi code / build lại.
try {
  const { pid } = JSON.parse(readFileSync(path.join(DIR, '.adxlens-preview-app.json'), 'utf8'));
  if (Number.isInteger(pid)) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
} catch {
  /* chưa chạy */
}

const NEXT_GENERATED = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'];
ok('git', ['checkout', '--', ...NEXT_GENERATED], inDir);
const current = out('git', ['rev-parse', 'HEAD'], inDir);
if (current !== target) {
  if (out('git', ['status', '--porcelain', '--untracked-files=no'], inDir)) {
    fail(`Thư mục xem trước có file bị sửa tay. Không sửa code ở ${DIR}.`);
  }
  step(`Chuyển bản xem trước ${current.slice(0, 7)} → ${target.slice(0, 7)}…`);
  run('git', ['checkout', '--detach', target], inDir);
}
const changed = created ? '' : out('git', ['diff', '--name-only', current, target], inDir);
if (
  needsInstall({ created, hasModules: existsSync(path.join(DIR, 'node_modules/.modules.yaml')), changedFiles: changed })
) {
  step('Cài phụ thuộc (pnpm install)…');
  run('pnpm', ['install', '--frozen-lockfile'], inDir);
}

const stamp = buildStamp(target, out('git', ['status', '--porcelain', '--', 'apps/web', 'packages'], inDir));
const stampFile = path.join(DIR, 'apps/web/.next/adxlens-build-stamp');
if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== stamp) {
  step('Build bản xem trước (2–4 phút; bản team không bị ảnh hưởng)…');
  run('pnpm', ['--filter', '@adxlens/web', 'build'], inDir);
  ok('git', ['checkout', '--', ...NEXT_GENERATED], inDir);
  writeFileSync(stampFile, stamp);
}

step('Redis + Supabase (dùng chung với bản team)…');
run('docker', ['compose', '-f', 'infra/docker/compose.yml', 'up', '-d', '--wait'], inDir);
if (!ok('pnpm', ['exec', 'supabase', 'status', '--workdir', 'infra'], { cwd: MAIN })) {
  fail('Supabase chưa chạy. Mở bản team (Cap-nhat-AdxLens.cmd) một lần rồi chạy lại.');
}

step('Migration database (chung với bản team)…');
run('pnpm', ['db:migrate'], inDir);

step('Bật bản xem trước…');
spawn('cmd.exe', ['/c', 'start "AdxLens (xem truoc)" cmd /k "chcp 65001 >nul & node scripts\\preview-run.mjs"'], {
  cwd: DIR,
  detached: true,
  stdio: 'ignore',
  windowsVerbatimArguments: true,
}).unref();
const until = Date.now() + 120_000;
while (!(await healthy())) {
  if (Date.now() > until) fail('Bản xem trước chưa lên sau 2 phút. Xem cửa sổ "AdxLens (xem truoc)".');
  await sleep(500);
}
writeFileSync(path.join(MAIN, PREVIEW_MARKER), JSON.stringify({ commit: target, at: new Date().toISOString() }));
spawn('cmd', ['/c', 'start', '', `${URL_}/login`], { detached: true, stdio: 'ignore' }).unref();
const log =
  current === target ? '' : out('git', ['log', '--no-merges', '--format=  - %s', `${current}..${target}`], inDir);
console.log(`
==================================================================
  ✔ Bản xem trước: ${target.slice(0, 7)} — ${URL_}
  Chỉ máy này thấy. Team vẫn dùng bản cũ.
  Test xong, OK → bấm Cap-nhat-AdxLens.cmd: team lên ĐÚNG commit ${target.slice(0, 7)}.
${log ? `  Thay đổi so với lần xem trước:\n${log.split('\n').slice(0, 25).join('\n')}\n` : ''}==================================================================
`);
