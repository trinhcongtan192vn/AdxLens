import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedClient, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { assignAdAccount, importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  adsManagerLink,
  computeHealth,
  getFinding,
  HEALTH_GROUP_CAP,
  HEALTH_PENALTY,
  healthScores,
  listFindings,
  loadSnapshot,
  recordFeedback,
  runAudit,
  wrongRateByRule,
  type Rule,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 6).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };

async function synced() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-i', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'mi' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  for (const c of enqueue.calls.slice(0, 3)) {
    await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys, clock });
  }
  return { ctx, adAccountId: a!.adAccountId, workspaceId: workspace.id };
}

/** Quy tắc thử: đánh dấu mọi ad có chi tiêu tuần này nằm trong `targets`. */
function fakeRule(targets: () => string[], severity: 'high' | 'low' = 'high'): Rule<{ minSpend: number }> {
  return {
    id: 'fake_rule',
    group: 'fake',
    phase: 'P0',
    defaults: { minSpend: 1 },
    minData: '7 ngày',
    detect: (s, c) =>
      s.ads
        .filter((a) => targets().includes(a.metaId) && Number(a.cur.spend) >= c.minSpend)
        .map((a) => ({
          entityType: 'ad' as const,
          metaId: a.metaId,
          entityName: a.name,
          severity,
          impactEstimate: a.cur.spend,
          impactMethod: 'rules.fake_rule.impact',
          evidence: { spend: [a.prev.spend, a.cur.spend] },
          why: { key: 'rules.fake_rule.why', params: { spend: a.cur.spend } },
          whatToDo: { key: 'rules.fake_rule.what' },
        })),
  };
}

describe('ảnh chụp dữ liệu', () => {
  it('cửa sổ 7 ngày gần và 7 ngày trước theo múi giờ tài khoản; tổng theo ad/ad set/campaign', async () => {
    const { ctx, adAccountId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    expect(s.window).toEqual({
      cur: { from: '2026-10-16', to: '2026-10-22' },
      prev: { from: '2026-10-09', to: '2026-10-15' },
    });
    expect(s.campaigns).toHaveLength(3);
    expect(s.ads.length).toBeGreaterThan(10);
    const ad = s.ads[0]!;
    expect(ad.cur.activeDays).toBe(7);
    expect(ad.prev.activeDays).toBe(7);
    expect(ad.cur.frequency).toBeGreaterThan(1);
    // Tổng chi tiêu ad = tổng chi tiêu campaign (cùng cửa sổ).
    const sum = (xs: { cur: { spend: string } }[]) => xs.reduce((t, x) => t + Number(x.cur.spend), 0);
    expect(Math.round(sum(s.ads))).toBe(Math.round(sum(s.campaigns)));
    expect(s.daysWithData).toBe(21);
  });

  it('chưa có dữ liệu → no_data', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
    const { connectionId } = await saveConnection(
      ctx,
      { token: 't', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'x' }, accounts: MOCK_ACCOUNTS },
      KEYS,
    );
    const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
    expect(await runAudit(ctx, a!.adAccountId, { rules: [fakeRule(() => [])], clock })).toEqual({ status: 'no_data' });
  });
});

describe('engine và vòng đời phát hiện (ADR-0006)', () => {
  it('phát hiện → hết thì resolved → quay lại thì mở lại; dismissed giữ nguyên', async () => {
    const { ctx, adAccountId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    const [a1, a2] = [s.ads[0]!.metaId, s.ads[1]!.metaId];
    let targets = [a1, a2];
    const rule = fakeRule(() => targets);
    expect(await runAudit(ctx, adAccountId, { rules: [rule], clock })).toMatchObject({ status: 'ok', detected: 2 });
    const list = await listFindings(ctx, adAccountId);
    expect(list.items).toHaveLength(2);
    const f1 = list.items.find((f) => f.metaId === a1)!;
    expect(f1.explanation.deepLink).toBe(adsManagerLink('act_100000001', 'ad', a1));
    expect(f1.impactEstimate).not.toBeNull();

    // Người dùng bỏ qua a2; a1 hết vấn đề.
    const f2 = list.items.find((f) => f.metaId === a2)!;
    await recordFeedback(ctx, f2.id, { kind: 'dismissed', note: 'Đang test creative' });
    targets = [a2];
    expect(await runAudit(ctx, adAccountId, { rules: [rule], clock })).toMatchObject({ detected: 1, resolved: 1 });
    expect((await getFinding(ctx, f1.id)).status).toBe('resolved');
    expect((await getFinding(ctx, f2.id)).status).toBe('dismissed');

    // a1 quay lại → mở lại `new`; vẫn một dòng.
    targets = [a1, a2];
    await runAudit(ctx, adAccountId, { rules: [rule], clock });
    expect((await getFinding(ctx, f1.id)).status).toBe('new');
    expect((await getFinding(ctx, f2.id)).status).toBe('dismissed');
    expect(await db.select().from(schema.findings)).toHaveLength(2);
  });

  it('cấu hình: tắt quy tắc → đóng phát hiện; ghi đè ngưỡng theo workspace', async () => {
    const { ctx, adAccountId, workspaceId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    const rule = fakeRule(() => [s.ads[0]!.metaId]);
    await runAudit(ctx, adAccountId, { rules: [rule], clock });
    await db.insert(schema.ruleConfigs).values({ workspaceId, ruleId: 'fake_rule', config: { minSpend: 1e15 } });
    expect(await runAudit(ctx, adAccountId, { rules: [rule], clock })).toMatchObject({ detected: 0, resolved: 1 });
    await db.update(schema.ruleConfigs).set({ config: {}, enabled: false });
    expect(await runAudit(ctx, adAccountId, { rules: [rule], clock })).toMatchObject({ detected: 0 });
  });

  it('một quy tắc lỗi không chặn quy tắc khác và không xóa phát hiện cũ của nó', async () => {
    const { ctx, adAccountId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    const good = fakeRule(() => [s.ads[0]!.metaId]);
    let broken = false;
    const flaky: Rule = {
      ...fakeRule(() => [s.ads[1]!.metaId]),
      id: 'flaky',
      detect: (snap, c) => {
        if (broken) throw new Error('boom');
        return fakeRule(() => [s.ads[1]!.metaId]).detect(snap, c as { minSpend: number });
      },
    };
    await runAudit(ctx, adAccountId, { rules: [good, flaky], clock });
    broken = true;
    const errors: string[] = [];
    await runAudit(ctx, adAccountId, { rules: [good, flaky], clock, onRuleError: (id) => errors.push(id) });
    expect(errors).toEqual(['flaky']);
    const open = (await listFindings(ctx, adAccountId)).items.map((f) => f.ruleId).sort();
    expect(open).toEqual(['fake_rule', 'flaky']);
  });
});

describe('phản hồi và quyền', () => {
  it('seen/done/wrong; bỏ qua cần lý do; tỷ lệ sai theo quy tắc', async () => {
    const { ctx, adAccountId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    await runAudit(ctx, adAccountId, { rules: [fakeRule(() => [s.ads[0]!.metaId, s.ads[1]!.metaId])], clock });
    const [x, y] = (await listFindings(ctx, adAccountId)).items;
    await recordFeedback(ctx, x!.id, { kind: 'seen' });
    expect((await getFinding(ctx, x!.id)).status).toBe('seen');
    await recordFeedback(ctx, x!.id, { kind: 'done' });
    expect((await getFinding(ctx, x!.id)).status).toBe('done');
    await expect(recordFeedback(ctx, y!.id, { kind: 'dismissed' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await recordFeedback(ctx, y!.id, { kind: 'wrong', note: 'Số đúng mà' });
    expect(await getFinding(ctx, y!.id)).toMatchObject({ status: 'dismissed', dismissReason: 'wrong' });
    expect(await wrongRateByRule(ctx)).toEqual([{ ruleId: 'fake_rule', total: 2, wrong: 1, rate: 0.5 }]);
    // Đóng thì không còn trong danh sách mặc định.
    expect((await listFindings(ctx, adAccountId)).items).toHaveLength(0);
    expect((await listFindings(ctx, adAccountId, { includeClosed: true })).items).toHaveLength(2);
  });

  it('buyer chỉ thấy phát hiện của Client được gán; workspace khác không thấy', async () => {
    const { ctx, adAccountId, workspaceId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    await runAudit(ctx, adAccountId, { rules: [fakeRule(() => [s.ads[0]!.metaId])], clock });
    const [f] = (await listFindings(ctx, adAccountId)).items;
    const mine = await seedClient(db, workspaceId, 'Của tôi');
    await seedClient(db, workspaceId, 'Khác');
    const buyer = await seedMember(db, workspaceId, 'buyer', [mine.id]);
    const bctx = { ...ctx, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    await expect(listFindings(bctx, adAccountId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await assignAdAccount(ctx, adAccountId, { clientId: mine.id });
    expect((await listFindings(bctx, adAccountId)).items).toHaveLength(1);
    await recordFeedback(bctx, f!.id, { kind: 'seen' });
    const ows = await seedWorkspace(db);
    const octx = {
      db,
      workspaceId: ows.workspace.id,
      actor: (await resolveActor(db, ows.workspace.id, ows.owner.id))!,
    };
    await expect(getFinding(octx, f!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(runAudit(octx, adAccountId, { rules: [], clock })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('health score (L3 8, khóa)', () => {
  it('điểm trừ high 15, medium 7, low 3; trần nhóm 30; sàn 0; có thành phần', () => {
    expect(HEALTH_PENALTY).toEqual({ high: 15, medium: 7, low: 3 });
    expect(HEALTH_GROUP_CAP).toBe(30);
    expect(computeHealth([])).toEqual({ score: 100, components: [] });
    const h = computeHealth([
      { ruleGroup: 'fatigue', severity: 'high' },
      { ruleGroup: 'fatigue', severity: 'high' },
      { ruleGroup: 'fatigue', severity: 'medium' },
      { ruleGroup: 'hygiene', severity: 'low' },
    ]);
    expect(h).toEqual({
      score: 67,
      components: [
        { group: 'fatigue', penalty: 30, findings: 3 },
        { group: 'hygiene', penalty: 3, findings: 1 },
      ],
    });
    const many = Array.from({ length: 5 }, (_, i) => ({ ruleGroup: `g${i}`, severity: 'high' as const }));
    expect(computeHealth([...many, ...many, ...many]).score).toBe(0);
  });

  it('chỉ tính phát hiện đang mở', async () => {
    const { ctx, adAccountId } = await synced();
    const s = (await loadSnapshot(ctx, adAccountId, clock))!;
    await runAudit(ctx, adAccountId, { rules: [fakeRule(() => [s.ads[0]!.metaId])], clock });
    expect((await healthScores(ctx, [adAccountId])).get(adAccountId)!.score).toBe(85);
    const [f] = (await listFindings(ctx, adAccountId)).items;
    await recordFeedback(ctx, f!.id, { kind: 'done' });
    expect((await healthScores(ctx, [adAccountId])).get(adAccountId)!.score).toBe(100);
  });
});

describe('deep link Ads Manager', () => {
  it('đúng cấp và tham số', () => {
    expect(adsManagerLink('act_123', 'ad', '456')).toBe(
      'https://adsmanager.facebook.com/adsmanager/manage/ads?act=123&selected_ad_ids=456',
    );
    expect(adsManagerLink('act_123', 'campaign', '7')).toContain('/campaigns?act=123&selected_campaign_ids=7');
    expect(adsManagerLink('act_123', null, null)).toBe(
      'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123',
    );
  });
});

describe('bộ quy tắc thật trên dữ liệu mock (có mẫu cài sẵn)', () => {
  it('phát hiện creative fatigue, ad thắng bị bỏ đói, phân mảnh đúng đối tượng', async () => {
    const { ctx, adAccountId } = await synced();
    const r = await runAudit(ctx, adAccountId, { clock });
    expect(r.status).toBe('ok');
    const found = (await listFindings(ctx, adAccountId, { limit: 200 })).items.map((f) => `${f.ruleId}:${f.metaId}`);
    expect(found).toContain('creative_fatigue:23010000000');
    expect(found).toContain('starved_winner:23010000102');
    expect(found).toContain('fragmentation:23012000');
  });
});
