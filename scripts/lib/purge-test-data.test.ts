import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import { isLocalDatabase, isRealConnection, planPurge } from './purge-test-data.mjs';

const conn = (id: string, metaUserId: string, isDemo = false) => ({ id, metaUserId, isDemo });

describe('dọn dữ liệu test / mock', () => {
  it('kết nối thật = id Meta dạng số, không phải dữ liệu mẫu', () => {
    expect(isRealConnection(conn('c', '10223344556677'))).toBe(true);
    expect(isRealConnection(conn('c', 'mock-meta-user'))).toBe(false);
    expect(isRealConnection(conn('c', 'm-123e4567'))).toBe(false);
    expect(isRealConnection(conn('c', '10223344556677', true))).toBe(false);
  });

  it('chỉ chạy với DB local', () => {
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:54322/postgres')).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@localhost:5432/x')).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@db.abcd.supabase.co:5432/postgres')).toBe(false);
    expect(isLocalDatabase('không phải url')).toBe(false);
  });

  it('giữ workspace có kết nối thật (gỡ kết nối mock bên trong); xóa phần còn lại và user test', () => {
    const plan = planPurge(
      [
        { id: 'w-real', name: 'Thật', connections: [conn('c1', '1001')] },
        { id: 'w-mixed', name: 'Thật + mock', connections: [conn('c2', '1002'), conn('c3', 'mock-meta-user')] },
        { id: 'w-e2e', name: 'Agency E2E', connections: [conn('c4', 'mock-meta-user')] },
        { id: 'w-demo', name: 'Demo', connections: [conn('c5', 'demo', true)] },
        { id: 'w-empty', name: 'Chưa kết nối', connections: [] },
      ],
      [
        { id: 'u-e2e', email: 'owner-1@e2e.local', workspaceIds: ['w-e2e'] },
        { id: 'u-test-kept', email: 'u-1@test.local', workspaceIds: ['w-real'] },
        { id: 'u-real', email: 'tan@example.com', workspaceIds: ['w-empty'] },
      ],
    );
    expect(plan.removeWorkspaceIds).toEqual(['w-e2e', 'w-demo', 'w-empty']);
    expect(plan.keepWorkspaces).toEqual(['Thật', 'Thật + mock']);
    expect(plan.mockConnections).toEqual([{ workspaceId: 'w-mixed', connectionId: 'c3' }]);
    // User test còn là thành viên workspace được giữ → giữ; email thật không bao giờ bị xóa.
    expect(plan.removeUserIds).toEqual(['u-e2e']);
  });
});
