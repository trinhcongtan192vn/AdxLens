import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND_LIST, notify } from '@adxlens/core/notification';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import en from '../../../../../messages/en.json';
import vi from '../../../../../messages/vi.json';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as list from './route';
import * as readOne from './[id]/read/route';
import * as settings from '../me/notification-settings/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API thông báo (X05, ST05)', () => {
  it('danh sách đã dịch + số chưa đọc; đọc một; đọc tất cả', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id };
    await notify(ctx, {
      kind: 'sync_done',
      recipients: { userIds: [owner.id] },
      params: { account: 'Linh 01' },
      link: '/accounts/x',
    });
    await notify(ctx, {
      kind: 'token_expiring',
      recipients: { userIds: [owner.id] },
      params: { days: 3 },
      email: false,
    });
    const u = asUser(owner);
    const r = await call(list.GET, { user: u, workspaceId: workspace.id });
    const body = r.body as { unread: number; items: { id: string; title: string; body: string }[] };
    expect(body.unread).toBe(2);
    expect(body.items.map((i) => i.title)).toEqual(['Kết nối Meta hết hạn sau 3 ngày', 'Đồng bộ xong Linh 01']);
    expect(
      (
        await call(readOne.POST, {
          user: u,
          workspaceId: workspace.id,
          params: { id: body.items[0]!.id },
          method: 'POST',
        })
      ).status,
    ).toBe(204);
    expect((await call(list.POST, { user: u, workspaceId: workspace.id, method: 'POST' })).body).toEqual({ marked: 1 });
  });

  it('cài đặt: lưu loại thường, loại bắt buộc giữ bật', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const r = await call(settings.PATCH, {
      user: u,
      workspaceId: workspace.id,
      method: 'PATCH',
      body: {
        items: [
          { kind: 'report_viewed', in_app: true, email: true },
          { kind: 'billing_failed', in_app: false, email: false },
        ],
      },
    });
    const items = (r.body as { items: { kind: string; in_app: boolean; email: boolean; mandatory: boolean }[] }).items;
    expect(items.find((i) => i.kind === 'report_viewed')).toMatchObject({ email: true });
    expect(items.find((i) => i.kind === 'billing_failed')).toMatchObject({
      mandatory: true,
      in_app: true,
      email: true,
    });
  });

  it('mọi loại có nhãn, tiêu đề, nội dung ở cả vi và en', () => {
    for (const msgs of [vi, en]) {
      const kinds = (msgs.notifications as { kinds: Record<string, { label: string; title: string; body: string }> })
        .kinds;
      for (const k of NOTIFICATION_KIND_LIST) {
        expect(kinds[k]?.label && kinds[k]?.title && kinds[k]?.body, k).toBeTruthy();
      }
    }
  });
});
