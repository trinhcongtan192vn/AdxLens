export type AccountSync = {
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  daysDone: number;
  daysTotal: number;
  error: string | null;
};

/** Tóm tắt S06: % theo số ngày đã đồng bộ, số tài khoản xong, có đang chạy/lỗi không. */
export function summarizeSync(rows: AccountSync[]) {
  const total = rows.reduce((n, r) => n + (r.daysTotal || 0), 0);
  const done = rows.reduce((n, r) => n + Math.min(r.daysDone, r.daysTotal), 0);
  const failed = rows.filter((r) => r.status === 'failed');
  return {
    percent: total ? Math.floor((done / total) * 100) : 0,
    accountsDone: rows.filter((r) => r.status === 'succeeded').length,
    accountsTotal: rows.length,
    active: rows.some((r) => r.status === 'queued' || r.status === 'running' || r.status === 'pending'),
    allDone: rows.length > 0 && rows.every((r) => r.status === 'succeeded'),
    failedCount: failed.length,
    /** Lỗi tiêu biểu để hiện banner (token > quyền > tạm thời). */
    error: (['META_TOKEN_INVALID', 'META_NO_ACCESS'].find((c) => failed.some((f) => f.error === c)) ??
      (failed.length ? 'TRANSIENT' : null)) as 'META_TOKEN_INVALID' | 'META_NO_ACCESS' | 'TRANSIENT' | null,
  };
}

/**
 * Đồng bộ dài đang chạy ở nền (backfill 90 ngày, đồng bộ lại thủ công) cho chỉ báo trên toàn app: người dùng vào trang
 * chủ ngay, số liệu hiện dần theo từng khối 7 ngày (mới nhất trước). Đồng bộ hằng ngày (vài chục giây) không tính.
 * Không có → null.
 */
export function backgroundSync(rows: (AccountSync & { kind: 'backfill' | 'daily' | 'manual' | null })[]) {
  const long = rows.filter(
    (r) => (r.kind === 'backfill' || r.kind === 'manual') && (r.status === 'queued' || r.status === 'running'),
  );
  if (!long.length) return null;
  const total = long.reduce((n, r) => n + (r.daysTotal || 0), 0);
  const done = long.reduce((n, r) => n + Math.min(r.daysDone, r.daysTotal), 0);
  return { percent: total ? Math.floor((done / total) * 100) : 0, accounts: long.length };
}
