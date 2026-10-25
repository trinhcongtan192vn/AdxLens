// Phần thuần của `pnpm purge:test-data` (test được không cần DB).

/** Email của tài khoản do test / E2E tạo. */
export const TEST_EMAIL = /@(e2e|test)\.local$/i;

/** Kết nối Meta thật: id người dùng Meta là số và không phải dữ liệu mẫu (mock: `mock-meta-user`, test: `m-…`). */
export function isRealConnection(c) {
  return !c.isDemo && /^\d+$/.test(c.metaUserId ?? '');
}

/** Chỉ chạy với DB trên máy (local) — không bao giờ staging / production (CLAUDE.md quy tắc 9). */
export function isLocalDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Chia workspace thành xóa / giữ (PM 25/10/2026: "Test + mock, giữ ws thật"):
 * - không có kết nối Meta thật nào → xóa cả workspace;
 * - có kết nối thật → giữ, chỉ gỡ các kết nối mock / mẫu bên trong.
 * User xóa: email test và không còn là thành viên của workspace được giữ.
 */
export function planPurge(workspaces, users) {
  const keep = workspaces.filter((w) => w.connections.some(isRealConnection));
  const remove = workspaces.filter((w) => !w.connections.some(isRealConnection));
  const mockConnections = keep.flatMap((w) =>
    w.connections.filter((c) => !isRealConnection(c)).map((c) => ({ workspaceId: w.id, connectionId: c.id })),
  );
  const keptIds = new Set(keep.map((w) => w.id));
  const removeUsers = users.filter((u) => TEST_EMAIL.test(u.email) && !u.workspaceIds.some((id) => keptIds.has(id)));
  return {
    removeWorkspaceIds: remove.map((w) => w.id),
    keepWorkspaces: keep.map((w) => w.name),
    mockConnections,
    removeUserIds: removeUsers.map((u) => u.id),
  };
}
