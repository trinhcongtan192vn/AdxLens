import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { creativeCopy, funnelStageOf, startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { adCopyInsights, copyLength, landingKey, landingPages, stageAnalysis } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const cur = { from: '2026-10-16', to: '2026-10-22' };
const prev = { from: '2026-10-09', to: '2026-10-15' };

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-cs',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `cs${name}` },
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
  return { ctx, id: a!.adAccountId };
}

describe('giai đoạn phễu, trang đích, chữ quảng cáo (Madgicx 360° Audit)', () => {
  it('phân loại giai đoạn theo loại custom audience; không đọc được audience → null', () => {
    const t = new Map([
      ['lal', 'LOOKALIKE'],
      ['web', 'WEBSITE'],
      ['list', 'CUSTOM'],
      ['eng', 'ENGAGEMENT'],
    ]);
    expect(funnelStageOf([], t)).toBe('prospecting');
    expect(funnelStageOf(['lal'], t)).toBe('prospecting');
    expect(funnelStageOf(['eng'], t)).toBe('re_engagement');
    expect(funnelStageOf(['web', 'eng'], t)).toBe('retargeting');
    expect(funnelStageOf(['web', 'list'], t)).toBe('retention');
    expect(funnelStageOf(['web'], null)).toBeNull();
  });

  it('đồng bộ lưu giai đoạn của nhóm QC và chữ / URL của creative; tổng theo giai đoạn = tổng tài khoản', async () => {
    const { ctx, id } = await setup();
    const stages = await db.execute<{ stage: string }>(sql`
      select distinct attrs->>'funnel_stage' as stage from analytics.entities
      where ad_account_id = ${id} and entity_type = 'adset'`);
    expect(new Set(stages.map((s) => s.stage))).toEqual(new Set(['prospecting', 'retargeting', 'retention']));
    const rows = await stageAnalysis(ctx, [id], cur, prev);
    const [raw] = await db.execute<{ spend: string }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where ad_account_id = ${id} and date between '2026-10-16' and '2026-10-22'`);
    const sum = rows.reduce((t, r) => t + Number(r.metrics.spend), 0);
    expect(sum).toBeCloseTo(Number(raw!.spend), 2);
    expect(rows.reduce((t, r) => t + r.spendShare, 0)).toBeCloseTo(100, 0);
    expect(rows.find((r) => r.stage === 'retention')!.adsets).toBe(1);
  });

  it('trang đích gộp theo host + đường dẫn (bỏ UTM); tỷ lệ chuyển đổi', async () => {
    expect(landingKey('https://www.shop.vn/sale/?utm_source=fb')).toBe('shop.vn/sale');
    expect(landingKey('https://shop.vn/')).toBe('shop.vn');
    expect(landingKey('javascript:alert(1)')).toBeNull();
    const { ctx, id } = await setup();
    const pages = await landingPages(ctx, [id], cur);
    expect(pages.map((p) => p.page).sort()).toEqual([
      'shop.example.vn/bo-suu-tap',
      'shop.example.vn/sale',
      'shop.example.vn/uu-dai',
    ]);
    expect(pages.every((p) => p.cvr === null || p.cvr >= 0)).toBe(true);
  });

  it('chữ quảng cáo: độ dài, emoji, link, top emoji, ma trận 4 góc', async () => {
    expect([copyLength('ngắn'), copyLength('a'.repeat(150)), copyLength('a'.repeat(300))]).toEqual([
      'short',
      'medium',
      'long',
    ]);
    const { ctx, id } = await setup();
    const r = await adCopyInsights(ctx, [id], cur);
    expect(r.byLength.map((g) => g.key).sort()).toEqual(['medium', 'short']);
    expect(r.byEmoji.map((g) => g.key).sort()).toEqual(['with', 'without']);
    expect(r.byLength.reduce((t, g) => t + g.spendShare, 0)).toBeCloseTo(100, 0);
    expect(r.topEmojis.map((e) => e.emoji)).toEqual(expect.arrayContaining(['🔥', '👉']));
    expect(r.copies).toHaveLength(3);
    expect(new Set(r.copies.map((c) => c.quadrant)).size).toBeGreaterThan(1);
  });

  it('chữ / URL lấy từ object_story_spec khi trường gốc trống', () => {
    expect(
      creativeCopy({
        id: '1',
        object_story_spec: { link_data: { link: 'https://a.vn/x', message: 'Xin chào', name: 'Tiêu đề' } },
      }),
    ).toEqual({ body: 'Xin chào', title: 'Tiêu đề', link: 'https://a.vn/x', cta: null });
  });

  it('cách ly workspace', async () => {
    const a = await setup('A');
    const b = await setup('B');
    expect(await stageAnalysis(b.ctx, [a.id], cur, prev)).toEqual([]);
    expect(await landingPages(b.ctx, [a.id], cur)).toEqual([]);
    expect((await adCopyInsights(b.ctx, [a.id], cur)).copies).toEqual([]);
  });
});
