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
