import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MOCK_DISCREPANCY, MockMetaRead } from '@adxlens/meta-client/mock';
import { assignAdAccount, importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { runAudit } from '@adxlens/core/insight';
import { reconcileAccount } from '@adxlens/core/reconciliation';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  buildReport,
  compareRange,
  createReport,
  getReport,
  isBlocked,
  listReports,
  rebuildReport,
  reportIntegrity,
  updateReportEdits,
  type ReportContent,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 2).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };
const meta = new MockMetaRead(now);
const period = { from: '2026-10-16', to: '2026-10-22' };

async function clientWithData(act = 'act_100000001', confirm = true) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-rp', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'rp' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: [act] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  for (const c of enqueue.calls.slice(0, 3)) await syncRange(ctx, c.payload as never, { meta, keys: KEYS.keys, clock });
  await reconcileAccount(
    ctx,
    { adAccountId: a!.adAccountId, from: '2026-10-02', to: '2026-10-22' },
    { meta, keys: KEYS.keys, clock },
  );
  await runAudit(ctx, a!.adAccountId, { clock });
  const r = confirm ? await assignAdAccount(ctx, a!.adAccountId, { createClientName: 'Linh' }) : null;
  let clientId = r?.clientId ?? null;
  if (!clientId) {
    const [c] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Linh' }).returning();
    await db.update(schema.adAccounts).set({ clientId: c!.id }).where(eq(schema.adAccounts.id, a!.adAccountId));
    clientId = c!.id;
  }
  return { ctx, clientId: clientId!, adAccountId: a!.adAccountId, ws: workspace.id };
}

describe('báo cáo (R02, R03)', () => {
  it('tạo → enqueue dựng → nội dung có KPI, so kỳ trước, phát hiện, nguồn số liệu (P0-13)', async () => {
    const { ctx, clientId, adAccountId } = await clientWithData();
    const enqueue = recordingEnqueue();
    const { id } = await createReport(ctx, { clientId, kind: 'periodic', ...period }, { enqueue });
    expect(enqueue.calls).toEqual([{ name: 'report:build', payload: { workspaceId: ctx.workspaceId, reportId: id } }]);
    expect((await getReport(ctx, id)).status).toBe('building');

    expect(await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, id, clock)).toBe('ready');
    const r = await getReport(ctx, id);
    const c = r.content as unknown as ReportContent;
    expect(c.period).toEqual(period);
    expect(c.compare).toEqual(compareRange(period));
    expect(c.client.name).toBe('Linh');
    expect(c.locale).toBe('vi');
    expect(c.accounts).toHaveLength(1);
    expect(c.accounts[0]!.id).toBe(adAccountId);
    expect(Number(c.accounts[0]!.kpis.spend)).toBeGreaterThan(0);
    expect(c.accounts[0]!.daily).toHaveLength(7);
    expect(c.accounts[0]!.topCampaigns.length).toBeGreaterThan(0);
    expect(c.findings.length).toBeGreaterThan(0);
    expect(c.findings[0]!.severity).toBe('high');
    expect(c.source).toMatchObject({
      attribution: '7d_click_1d_view',
      currencies: ['VND'],
      timezones: ['Asia/Ho_Chi_Minh'],
    });
    expect(c.source.matchedAt).not.toBeNull();
    expect(r.reconciliationStatus).toBe('ok');
    expect(isBlocked(r.integrity)).toBe(false);
  });

  it('toàn vẹn (ADR-0007): chưa xác nhận gán hoặc ngày lệch trong kỳ → bị khóa chia sẻ, vẫn tạo được', async () => {
    const un = await clientWithData('act_100000001', false);
    const i1 = await reportIntegrity(un.ctx, un.clientId, period);
    expect(i1.unconfirmedAccounts).toEqual([un.adAccountId]);
    expect(isBlocked(i1)).toBe(true);

    const lech = await clientWithData(MOCK_DISCREPANCY.account);
    const i2 = await reportIntegrity(lech.ctx, lech.clientId, period);
    expect(i2.warningDates).toEqual([{ adAccountId: lech.adAccountId, dates: ['2026-10-20'] }]);
    const { id } = await createReport(
      lech.ctx,
      { clientId: lech.clientId, kind: 'audit', ...period },
      { enqueue: recordingEnqueue() },
    );
    await buildReport({ ...lech.ctx, actor: SYSTEM_ACTOR }, id, clock);
    const r = await getReport(lech.ctx, id);
    expect(r.status).toBe('ready');
    expect(r.reconciliationStatus).toBe('warning');
    expect(isBlocked(r.integrity)).toBe(true);
    // Kỳ không chứa ngày lệch → không khóa.
    expect(isBlocked(await reportIntegrity(lech.ctx, lech.clientId, { from: '2026-10-21', to: '2026-10-22' }))).toBe(
      false,
    );
  });

  it('chỉnh nội dung agency, dựng lại, danh sách; khoảng ngày sai bị từ chối', async () => {
    const { ctx, clientId } = await clientWithData();
    const enqueue = recordingEnqueue();
    const { id } = await createReport(ctx, { clientId, kind: 'periodic', ...period, locale: 'en' }, { enqueue });
    const edits = await updateReportEdits(ctx, id, { title: '  Báo cáo tuần  ', workDone: 'Tắt 2 ad mệt' });
    expect(edits).toEqual({ title: 'Báo cáo tuần', workDone: 'Tắt 2 ad mệt' });
    await rebuildReport(ctx, id, { enqueue });
    expect(enqueue.calls).toHaveLength(2);
    const list = await listReports(ctx);
    expect(list).toMatchObject([{ id, clientName: 'Linh', locale: 'en', kind: 'periodic' }]);
    await expect(
      createReport(ctx, { clientId, kind: 'audit', from: '2026-01-01', to: '2026-10-22' }, { enqueue }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createReport(ctx, { clientId, kind: 'audit', from: '2026-10-22', to: '2026-10-01' }, { enqueue }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('buyer: không tạo được, chỉ thấy báo cáo của Client được gán; workspace khác không thấy', async () => {
    const { ctx, clientId, ws } = await clientWithData();
    const { id } = await createReport(ctx, { clientId, kind: 'periodic', ...period }, { enqueue: recordingEnqueue() });
    const lim = await seedMember(db, ws, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, ws, lim.id))! };
    await expect(
      createReport(bctx, { clientId, kind: 'periodic', ...period }, { enqueue: recordingEnqueue() }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await listReports(bctx)).toEqual([]);
    await expect(getReport(bctx, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const ok = await seedMember(db, ws, 'buyer', [clientId]);
    const okctx = { ...ctx, actor: (await resolveActor(db, ws, ok.id))! };
    expect((await listReports(okctx)).map((r) => r.id)).toEqual([id]);
    const other = await seedWorkspace(db);
    const octx = {
      db,
      workspaceId: other.workspace.id,
      actor: (await resolveActor(db, other.workspace.id, other.owner.id))!,
    };
    await expect(getReport(octx, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
