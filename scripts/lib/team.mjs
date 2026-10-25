// Hàm thuần cho bản team test (scripts/team.mjs). Tách riêng để test được.
import path from 'node:path';

/** Thư mục bản team: cạnh thư mục dev, thêm hậu tố `-team` (vd. E:\VideCode\AdxLens → E:\VideCode\AdxLens-team). */
export function teamDirOf(mainDir) {
  const clean = path.resolve(mainDir);
  return `${clean}-team`;
}

/** PID đang LISTEN trên `port` từ kết quả `netstat -ano` (Windows); không có → null. */
export function listeningPid(netstatOutput, port) {
  for (const line of netstatOutput.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234   |   TCP  [::]:3000  [::]:0  LISTENING  1234
    if (cols[0] !== 'TCP' || cols[3] !== 'LISTENING') continue;
    if (cols[1]?.endsWith(`:${port}`)) {
      const pid = Number(cols[4]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
  }
  return null;
}

/** Cần `pnpm install` khi: worktree mới, chưa có node_modules, hoặc pnpm-lock.yaml đổi giữa hai bản. */
export function needsInstall({ created, hasModules, changedFiles }) {
  return created || !hasModules || changedFiles.split(/\r?\n/).some((f) => f.trim() === 'pnpm-lock.yaml');
}

/** "12,3 giây" / "1 phút 5 giây". */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 100) / 10);
  if (s < 60) return `${String(s).replace('.', ',')} giây`;
  const m = Math.floor(s / 60);
  return `${m} phút ${Math.round(s - m * 60)} giây`;
}

/** Thư mục bản xem trước của PM: cạnh thư mục dev, hậu tố `-preview` (vd. E:\VideCode\AdxLens-preview). */
export function previewDirOf(mainDir) {
  return `${path.resolve(mainDir)}-preview`;
}

/** Cổng của bản xem trước (bản team dùng 3000). */
export const PREVIEW_PORT = 3100;

/**
 * Commit đưa lên bản team: commit PM đã xem trước (nếu có và vẫn nằm trong develop), không thì develop mới nhất.
 * `isAncestor(commit)` = commit thuộc lịch sử origin/develop.
 */
export function promoteTarget({ previewCommit, developHead, isAncestor }) {
  if (previewCommit && /^[0-9a-f]{40}$/.test(previewCommit) && isAncestor(previewCommit)) {
    return { commit: previewCommit, source: 'preview' };
  }
  return { commit: developHead, source: 'develop' };
}

/** Env cho tiến trình của bản xem trước: URL localhost, Redis riêng (db 1), không job định kỳ. */
export function previewEnv(redisUrl = 'redis://127.0.0.1:6379') {
  const u = new URL(redisUrl);
  u.pathname = '/1';
  const app = `http://localhost:${PREVIEW_PORT}`;
  return {
    APP_URL: app,
    PUBLIC_REPORT_URL: `${app}/r`,
    REDIS_URL: u.toString(),
    WORKER_SCHEDULES: 'off',
    PORT: String(PREVIEW_PORT),
  };
}
