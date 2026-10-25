import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  childRows,
  descendantIds,
  entityCpaChange,
  entityDaily,
  entityFindings,
  entityHistory,
  entityInfo,
  entityKpis,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const cur = { from: '2026-10-08', to: '2026-10-14' };
const prev = { from: '2026-10-01', to: '2026-10-07' };

/** Chiến dịch c1 → nhóm s1 (ad a1, a2), s2 (ad a3); chiến dịch c2 → s3 (ad a4). */
async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  const ws = workspace.id;
  const e = (entityType: 'campaign' | 'adset' | 'ad', metaId: string, parentMetaId: string | null) => ({
    workspaceId: ws,
    adAccountId: acc.id,
    entityType,
    metaId,
    parentMetaId,
    name: `N ${metaId}`,
    status: 'ACTIVE',
  });
  await db
    .insert(schema.entities)
    .values([
      e('campaign', 'c1', null),
      e('campaign', 'c2', null),
      e('adset', 's1', 'c1'),
      e('adset', 's2', 'c1'),
      e('adset', 's3', 'c2'),
      e('ad', 'a1', 's1'),
      e('ad', 'a2', 's1'),
      e('ad', 'a3', 's2'),
      e('ad', 'a4', 's3'),
    ]);
  const day = (ad: string, adset: string, campaign: string, date: string, spend: number, results: number) => ({
    workspaceId: ws,
    adAccountId: acc.id,
    entityType: 'ad' as const,
    metaId: ad,
    adsetId: adset,
    campaignId: campaign,
    date,
    spend: String(spend),
    impressions: 10_000,
    linkClicks: 100,
    clicks: 100,
    results,
    attributionWindow: '7d_click_1d_view',
  });
  await db.insert(schema.insightsDaily).values([
    // Kỳ trước: CPA c1 = 10.000.
    day('a1', 's1', 'c1', '2026-10-02', 500_000, 50),
    day('a3', 's2', 'c1', '2026-10-02', 500_000, 50),
    // Kỳ này: s2 xấu đi → CPA c1 tăng.
    day('a1', 's1', 'c1', '2026-10-09', 500_000, 50),
    day('a2', 's1', 'c1', '2026-10-10', 100_000, 10),
    day('a3', 's2', 'c1', '2026-10-09', 900_000, 30),
    day('a4', 's3', 'c2', '2026-10-09', 7_000_000, 70),
  ]);
  return { ctx, acc, ws };
}

describe('trang chiến dịch / nhóm QC / quảng cáo (G2)', () => {
  it('KPI và chuỗi ngày đúng phạm vi từng cấp, không lẫn chiến dịch khác', async () => {
    const { ctx, acc } = await setup();
    expect(await entityKpis(ctx, acc.id, 'campaign', 'c1', cur)).toMatchObject({ spend: '1500000.0000', results: 90 });
    expect(await entityKpis(ctx, acc.id, 'adset', 's1', cur)).toMatchObject({ spend: '600000.0000', results: 60 });
    expect(await entityKpis(ctx, acc.id, 'ad', 'a3', cur)).toMatchObject({ spend: '900000.0000', results: 30 });
    const daily = await entityDaily(ctx, acc.id, 'adset', 's1', cur);
    expect(daily).toHaveLength(7);
    expect(daily.filter((d) => Number(d.spend) > 0).map((d) => d.date)).toEqual(['2026-10-09', '2026-10-10']);
  });

  it('con trực tiếp, con cháu, chuỗi cha cho đường dẫn', async () => {
    const { ctx, acc } = await setup();
    expect((await childRows(ctx, acc.id, 'campaign', 'c1', cur)).map((r) => [r.metaId, r.kpis.results])).toEqual([
      ['s2', 30],
      ['s1', 60],
    ]);
    expect((await childRows(ctx, acc.id, 'adset', 's1', cur)).map((r) => r.metaId)).toEqual(['a1', 'a2']);
    expect(await childRows(ctx, acc.id, 'ad', 'a1', cur)).toEqual([]);
    expect((await descendantIds(ctx, acc.id, 'campaign', 'c1')).sort()).toEqual(['a1', 'a2', 'a3', 'c1', 's1', 's2']);
    const info = await entityInfo(ctx, acc.id, 'ad', 'a3');
    expect(info).toMatchObject({ campaign: { metaId: 'c1' }, adset: { metaId: 's2' }, name: 'N a3' });
  });

  it('vì sao CPA của chiến dịch: nhóm QC đóng góp nhiều nhất là nhóm xấu đi', async () => {
    const { ctx, acc } = await setup();
    const x = (await entityCpaChange(ctx, acc.id, 'campaign', 'c1', cur, prev))!;
    expect(x.changePct).toBeCloseTo(66.7, 0);
    expect(x.drivers[0]).toMatchObject({ metaId: 's2' });
  });

  it('vấn đề và lịch sử chỉ của đối tượng + con cháu; workspace khác → 404', async () => {
    const { ctx, acc, ws } = await setup();
    const finding = (metaId: string, entityType: string) => ({
      workspaceId: ws,
      adAccountId: acc.id,
      ruleId: 'creative_fatigue',
      ruleGroup: 'creative',
      entityType,
      metaId,
      severity: 'medium' as const,
      evidence: {},
      explanation: { why: { key: 'x' }, whatToDo: { key: 'y' }, deepLink: null },
      snapshotVersion: 'v1',
    });
    await db.insert(schema.findings).values([finding('a3', 'ad'), finding('a4', 'ad')]);
    expect((await entityFindings(ctx, acc.id, 'campaign', 'c1')).length).toBe(1);
    expect((await entityFindings(ctx, acc.id, 'adset', 's1')).length).toBe(0);
    await db.insert(schema.actions).values({
      workspaceId: ws,
      adAccountId: acc.id,
      actionType: 'pause_ad',
      targetType: 'ad',
      targetMetaId: 'a2',
      tier: 'approve',
      params: {},
      beforeState: { status: 'ACTIVE' },
      afterExpected: { status: 'PAUSED' },
      idempotencyKey: 'k-a2',
    });
    expect((await entityHistory(ctx, acc.id, 'campaign', 'c1')).map((a) => a.actionType)).toEqual(['pause_ad']);
    expect(await entityHistory(ctx, acc.id, 'campaign', 'c2')).toEqual([]);

    const other = await setup();
    await expect(entityInfo(other.ctx, acc.id, 'campaign', 'c1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(entityKpis(other.ctx, acc.id, 'campaign', 'c1', cur)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
