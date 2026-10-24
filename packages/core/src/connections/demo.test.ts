import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MetaApiError } from '@adxlens/meta-client';
import { MockMetaRead } from '@adxlens/meta-client/mock';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { buildReport, createReport, createShareLink } from '@adxlens/core/reporting';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { demoConnection, keysFromEnv, listAdAccounts, metaFor, removeDemo, startDemo } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 16).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');

/** Meta "thật" luôn lỗi: chứng minh kết nối mẫu không bao giờ gọi Meta. */
class RealMetaThatFails extends MockMetaRead {
  override async getInsights(): Promise<never> {
    throw new MetaApiError(400, 190, null, 'OAuthException', 'real meta must not be called', null);
  }
  override async listCampaigns(): Promise<never> {
    throw new MetaApiError(400, 190, null, 'OAuthException', 'real meta must not be called', null);
  }
}

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const enqueue = recordingEnqueue();
  const deps = {
    keys: KEYS,
    enqueue,
    startBackfill: (id: string) => startBackfill(ctx, id, { enqueue, clock: { now } }),
  };
  return { ctx, enqueue, deps };
}

describe('tài khoản mẫu (S01, PRD P0-02)', () => {
  it('tạo kết nối mẫu + 2 tài khoản đã gán Client mẫu + backfill; gọi lại không tạo thêm', async () => {
    const { ctx, enqueue, deps } = await setup();
    const r = await startDemo(ctx, deps);
    expect(r.created).toBe(true);
    const accounts = await listAdAccounts(ctx);
    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.isDemo && a.assignmentStatus === 'confirmed')).toBe(true);
    expect(accounts.map((a) => a.clientName).sort()).toEqual(['Khách mẫu · Cà phê', 'Khách mẫu · Thời trang']);
    const demoClients = await db.select().from(schema.clients).where(eq(schema.clients.isDemo, true));
    expect(demoClients).toHaveLength(2);
    expect(enqueue.calls.filter((c) => c.name === 'sync:backfill_account').length).toBe(26);
    expect(await startDemo(ctx, deps)).toEqual({ connectionId: r.connectionId, created: false });
  });

  it('đồng bộ kết nối mẫu dùng dữ liệu giả kể cả khi Meta thật lỗi', async () => {
    const { ctx, enqueue, deps } = await setup();
    await startDemo(ctx, deps);
    const real = new RealMetaThatFails(now);
    const job = enqueue.calls.find((c) => c.name === 'sync:backfill_account')!.payload as never;
    const r = await syncRange(ctx, job, { meta: real, keys: KEYS.keys, clock: { now } });
    expect(r).toMatchObject({ status: 'ok' });
    expect(metaFor({ isDemo: false }, real)).toBe(real);
    expect(metaFor({ isDemo: true }, real)).not.toBe(real);
  });

  it('báo cáo từ dữ liệu mẫu ghi rõ là mẫu và không chia sẻ được', async () => {
    const { ctx, enqueue, deps } = await setup();
    await startDemo(ctx, deps);
    const accs = await listAdAccounts(ctx);
    const job = enqueue.calls.find(
      (c) => c.name === 'sync:backfill_account' && (c.payload as { adAccountId: string }).adAccountId === accs[0]!.id,
    )!.payload as never;
    await syncRange(ctx, job, { meta: new MockMetaRead(now), keys: KEYS.keys, clock: { now } });
    const { id } = await createReport(
      ctx,
      { clientId: accs[0]!.clientId!, kind: 'periodic', from: '2026-10-16', to: '2026-10-22' },
      { enqueue },
    );
    await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, id, { now });
    const [rep] = await db.select().from(schema.reports);
    expect((rep!.content as { demo?: boolean }).demo).toBe(true);
    await expect(createShareLink(ctx, id, {})).rejects.toMatchObject({
      code: 'REPORT_BLOCKED',
      details: { demo: true },
    });
  });

  it('xóa dữ liệu mẫu: mất kết nối, tài khoản, Client mẫu; Client thật giữ nguyên', async () => {
    const { ctx, deps } = await setup();
    await startDemo(ctx, deps);
    await db.insert(schema.clients).values({ workspaceId: ctx.workspaceId, name: 'Khách thật' });
    expect(await removeDemo(ctx)).toBe(true);
    expect(await demoConnection(ctx)).toBeNull();
    expect(await listAdAccounts(ctx)).toEqual([]);
    expect((await db.select().from(schema.clients)).map((c) => c.name)).toEqual(['Khách thật']);
    expect(await removeDemo(ctx)).toBe(false);
  });
});
