import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { buyerOnboarding, dismissOnboarding, listOutcomes, signedChangePct } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

// Đánh dấu "Đã làm" 10:00 ngày 12/10 giờ VN.
const DONE_AT = new Date('2026-10-12T03:00:00Z');
const DONE = '2026-10-12';

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const client = await seedClient(db, workspace.id, 'Client A');
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  const rec = async (sourceKey: string, entityType: string, metaId: string, status = 'done') =>
    (
      await db
        .insert(schema.recommendations)
        .values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          week: '2026-10-12',
          source: 'finding',
          sourceKey,
          entityType,
          metaId,
          entityName: metaId,
          action: { key: 'x' },
          why: { key: 'y' },
          evidence: {},
          confidence: '0.5',
          effortMinutes: 10,
          score: '1',
          status: status as 'done',
          doneAt: status === 'done' ? DONE_AT : null,
        })
        .returning()
    )[0]!;
  /** 7 ngày trước và 7 ngày sau ngày làm cho ad `metaId` (thuộc ad set `adsetId`). */
  const days = async (
    metaId: string,
    adsetId: string,
    before: { spend: number; results: number; impressions: number; linkClicks: number },
    after: { spend: number; results: number; impressions: number; linkClicks: number },
  ) => {
    for (let i = 1; i <= 7; i++) {
      for (const [date, d] of [
        [addDays(DONE, -i), before],
        [addDays(DONE, i), after],
      ] as const) {
        await db.insert(schema.insightsDaily).values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          entityType: 'ad',
          metaId,
          adsetId,
          date,
          spend: String(d.spend),
          impressions: d.impressions,
          linkClicks: d.linkClicks,
          results: d.results,
          attributionWindow: '7d_click_1d_view',
        });
      }
    }
    // Ngày làm không tính.
    await db.insert(schema.insightsDaily).values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      entityType: 'ad',
      metaId,
      adsetId,
      date: DONE,
      spend: '99999999',
      results: 0,
      attributionWindow: '7d_click_1d_view',
    });
  };
  return { ctx, workspaceId: workspace.id, acc, client, rec, days };
}

describe('% thay đổi có dấu', () => {
  it('giảm → âm; tăng → dương; trước = 0 → không tính', () => {
    expect(signedChangePct('100', '80')).toBe('-20.000000');
    expect(signedChangePct(0.01, 0.012)).toBe('20.000000');
    expect(signedChangePct('0', '5')).toBeNull();
  });
});

describe('kết quả trước / sau (P105, P1-08)', () => {
  it('CPA cấp tài khoản giảm 7 ngày sau → cải thiện; bỏ chính ngày làm', async () => {
    const { ctx, rec, days } = await setup();
    await rec('spend_no_conversion', 'adset', 's1');
    await days(
      'ad1',
      's1',
      { spend: 100_000, results: 1, impressions: 1000, linkClicks: 10 },
      { spend: 100_000, results: 2, impressions: 1000, linkClicks: 10 },
    );
    const [o] = await listOutcomes(ctx, { clock: { now: () => new Date('2026-10-21T03:00:00Z') } });
    expect(o).toMatchObject({
      state: 'ready',
      metric: 'cpa',
      scope: 'account',
      before: '100000.0000',
      after: '50000.0000',
    });
    expect(o!.changePct).toBe('-50.000000');
    expect(o!.improved).toBe(true);
  });

  it('CTR của đúng ad (phạm vi đối tượng) giảm → không cải thiện', async () => {
    const { ctx, rec, days } = await setup();
    await rec('creative_fatigue', 'ad', 'ad1');
    await days(
      'ad1',
      's1',
      { spend: 1, results: 0, impressions: 1000, linkClicks: 20 },
      { spend: 1, results: 0, impressions: 1000, linkClicks: 10 },
    );
    await days(
      'ad2',
      's1',
      { spend: 1, results: 0, impressions: 1000, linkClicks: 1 },
      { spend: 1, results: 0, impressions: 1000, linkClicks: 90 },
    );
    const [o] = await listOutcomes(ctx, { clock: { now: () => new Date('2026-10-25T03:00:00Z') } });
    expect(o).toMatchObject({ metric: 'ctr', scope: 'entity', changePct: '-50.000000', improved: false });
  });

  it('chưa đủ 7 ngày sau → chờ; loại không có chỉ số đo → không đo; chỉ việc "Đã làm"', async () => {
    const { ctx, rec } = await setup();
    await rec('learning_limited', 'adset', 's1');
    await rec('account_hygiene', 'adset', 's2');
    await rec('starved_winner', 'ad', 'a3', 'in_progress');
    const list = await listOutcomes(ctx, { clock: { now: () => new Date('2026-10-18T03:00:00Z') } });
    expect(list.map((o) => [o.sourceKey, o.state])).toEqual(
      expect.arrayContaining([
        ['learning_limited', 'waiting'],
        ['account_hygiene', 'not_measured'],
      ]),
    );
    expect(list).toHaveLength(2);
    expect(list.find((o) => o.state === 'waiting')!.readyOn).toBe('2026-10-20');
  });

  it('buyer chỉ thấy kết quả của Client được gán; cách ly workspace', async () => {
    const { ctx, workspaceId, rec } = await setup();
    await rec('learning_limited', 'adset', 's1');
    const buyer = await seedMember(db, workspaceId, 'buyer', []);
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    expect(await listOutcomes(bctx)).toHaveLength(0);
    const other = await setup();
    expect(await listOutcomes(other.ctx)).toHaveLength(0);
    expect(await listOutcomes(ctx)).toHaveLength(1);
  });
});

describe('onboarding buyer (A08, P1-11)', () => {
  it('chỉ hiện cho buyer, liệt kê Client được giao; đóng rồi thì không hiện lại', async () => {
    const { ctx, workspaceId, client } = await setup();
    expect(await buyerOnboarding(ctx)).toBeNull(); // owner
    const buyer = await seedMember(db, workspaceId, 'buyer', [client.id]);
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    expect(await buyerOnboarding(bctx)).toEqual({
      clients: [{ id: client.id, name: 'Client A', accounts: 1 }],
      weekItems: 0,
      assignedToMe: 0,
    });
    await dismissOnboarding(bctx);
    expect(await buyerOnboarding(bctx)).toBeNull();
  });
});
