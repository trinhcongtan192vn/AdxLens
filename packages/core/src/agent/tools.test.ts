import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedClient,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { runTool, toolsFor } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 12).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const ON = { p2a_approve: true };

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test tools', override: true });
  }
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-tl',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `tl${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
  for (const c of enqueue.calls.slice(0, 2)) {
    await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  }
  const tctx = { ctx, defaultAccountId: null, now: now() };
  return { ctx, tctx, id: a!.adAccountId, owner };
}

type Row = Record<string, unknown>;

describe('Công cụ agent (ADR-0030 / 0031: nâng cấp bộ công cụ)', () => {
  it('account_structure: nhóm QC có ngân sách / giá thầu theo bản chụp; tên bọc «»; tài khoản workspace khác → lỗi', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const r = (await runTool('account_structure', { level: 'adset', account_id: a.id }, a.tctx, ON)).data as {
      money_unit: string;
      items: Row[];
    };
    expect(r.money_unit).toBe('minor');
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((x) => String(x.name).startsWith('«'))).toBe(true);
    // Nhóm QC LAL của dữ liệu mẫu có giá thầu 40000 (ADR-0025).
    expect(r.items.some((x) => x.bid_amount === '40000')).toBe(true);
    const camps = (await runTool('account_structure', { level: 'campaign', account_id: a.id }, a.tctx, ON)).data as {
      items: Row[];
    };
    expect(camps.items.some((x) => x.spend_cap === '60000000')).toBe(true);
    await expect(runTool('account_structure', { level: 'adset', account_id: b.id }, a.tctx, ON)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('launch_assets: nhóm QC mẫu, audience, ảnh sẵn sàng (bỏ ảnh đang tạo / lỗi)', async () => {
    const s = await setup();
    for (const status of ['ready', 'generating', 'failed'] as const) {
      await db.insert(schema.creativeDrafts).values({
        workspaceId: s.ctx.workspaceId,
        adAccountId: s.id,
        source: 'upload',
        status,
        storagePath: status === 'ready' ? 'x/y.png' : null,
        createdBy: s.owner.id,
      });
    }
    const r = (await runTool('launch_assets', { account_id: s.id }, s.tctx, ON)).data as {
      template_adsets: Row[];
      audiences: Row[];
      image_drafts: Row[];
    };
    expect(r.template_adsets.length).toBeGreaterThan(0);
    expect(r.image_drafts).toHaveLength(1);
  });

  it('store_summary: doanh thu cửa hàng + chi tiêu + MER tính sẵn; buyer không có Client → không có số', async () => {
    const s = await setup();
    const client = await seedClient(db, s.ctx.workspaceId, 'Shop A');
    await db.update(schema.adAccounts).set({ clientId: client.id }).where(eq(schema.adAccounts.id, s.id));
    const [acc] = await db.select().from(schema.adAccounts).where(eq(schema.adAccounts.id, s.id));
    const [conn] = await db
      .insert(schema.storeConnections)
      .values({
        workspaceId: s.ctx.workspaceId,
        clientId: client.id,
        provider: 'shopify',
        externalId: 'a.myshopify.com',
        name: 'A',
        currency: acc!.currency,
        timezone: acc!.timezone,
        tokenCiphertext: Buffer.from('x'),
        tokenKeyVersion: 1,
        createdBy: s.owner.id,
      })
      .returning();
    await db.insert(schema.storeDaily).values({
      workspaceId: s.ctx.workspaceId,
      connectionId: conn!.id,
      date: '2026-10-20',
      orders: 10,
      revenue: '5000000',
    });
    const r = (await runTool('store_summary', { period: 'last7' }, s.tctx, ON)).data as Row;
    expect(r).toMatchObject({ store_connections: 1, orders: 10, clients: ['«Shop A»'] });
    expect(Number(r.store_revenue)).toBe(5000000);
    expect(Number(r.ad_spend)).toBeGreaterThan(0);
    expect(r.mer).toBe(Math.round((5000000 / Number(r.ad_spend)) * 100) / 100);

    const buyer = await seedMember(db, s.ctx.workspaceId, 'buyer');
    const bctx = { ...s.tctx, ctx: { ...s.ctx, actor: (await resolveActor(db, s.ctx.workspaceId, buyer.id))! } };
    expect((await runTool('store_summary', {}, bctx, ON)).data).toMatchObject({ clients: [], store_revenue: null });
    await expect(runTool('store_summary', { client_id: client.id }, bctx, ON)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('propose_action: chiến dịch, đổi tên, giá thầu, giới hạn chi — cần đủ tham số; chỉ tạo thẻ, không tạo hành động', async () => {
    const s = await setup();
    const pick = async (type: string) => {
      const [e] = await db
        .select({ metaId: schema.entities.metaId })
        .from(schema.entities)
        .where(and(eq(schema.entities.adAccountId, s.id), eq(schema.entities.entityType, type as 'campaign')));
      return e!.metaId;
    };
    const camp = await pick('campaign');
    const adset = await pick('adset');
    const base = { account_id: s.id };
    await expect(
      runTool('propose_action', { ...base, action_type: 'rename_campaign', target_meta_id: camp }, s.tctx, ON),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      runTool('propose_action', { ...base, action_type: 'set_adset_bid', target_meta_id: adset }, s.tctx, ON),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    // Sai cấp: id nhóm QC cho hành động chiến dịch → không tìm thấy.
    await expect(
      runTool('propose_action', { ...base, action_type: 'pause_campaign', target_meta_id: adset }, s.tctx, ON),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const ren = await runTool(
      'propose_action',
      { ...base, action_type: 'rename_campaign', target_meta_id: camp, new_name: 'Sale 11.11' },
      s.tctx,
      ON,
    );
    expect(ren.proposal).toMatchObject({ actionType: 'rename_campaign', targetMetaId: camp, newName: 'Sale 11.11' });
    const bid = await runTool(
      'propose_action',
      { ...base, action_type: 'set_adset_bid', target_meta_id: adset, new_value: '42000' },
      s.tctx,
      ON,
    );
    expect(bid.proposal).toMatchObject({ actionType: 'set_adset_bid', newValue: '42000' });
    // Tham số đề xuất có trong kết quả công cụ → câu trả lời nhắc lại được đúng giá trị trên thẻ.
    expect(bid.data).toMatchObject({ proposed: true, new_value: '42000' });
    const [n] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.actions where workspace_id = ${s.ctx.workspaceId}`,
    );
    expect(n!.n).toBe(0);

    const off = { p2a_approve: false };
    expect(toolsFor(off).map((t) => t.name)).toEqual(expect.arrayContaining(['account_structure', 'store_summary']));
    await expect(
      runTool('propose_action', { ...base, action_type: 'pause_campaign', target_meta_id: camp }, s.tctx, off),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
