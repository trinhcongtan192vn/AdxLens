import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { assignAdAccount, importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { runAudit } from '@adxlens/core/insight';
import { memoryEmailSender, updateNotificationSettings } from '@adxlens/core/notification';
import { resolveActor } from '@adxlens/core/tenancy';
import { digestWeek, isDigestDue, mondayOf, sendWeeklyDigest } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 15).toString('base64') });
// Thứ Hai 26/10/2026 08:20 giờ Việt Nam.
const now = () => new Date('2026-10-26T01:20:00Z');
const clock = { now };

describe('thời điểm digest', () => {
  it('thứ Hai 08:00 theo múi giờ workspace; tuần = thứ Hai hiện tại', () => {
    expect(isDigestDue('Asia/Ho_Chi_Minh', now())).toBe(true);
    expect(isDigestDue('Asia/Tokyo', now())).toBe(false);
    expect(digestWeek('Asia/Ho_Chi_Minh', now())).toBe('2026-10-26');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
});

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-dg', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'dg' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const meta = new MockMetaRead(now);
  const ids: string[] = [];
  for (const act of ['act_100000001', 'act_100000003']) {
    const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: [act] });
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
    for (const c of enqueue.calls.slice(0, 2))
      await syncRange(ctx, c.payload as never, { meta, keys: KEYS.keys, clock });
    await runAudit(ctx, a!.adAccountId, { clock });
    ids.push(a!.adAccountId);
  }
  const r1 = await assignAdAccount(ctx, ids[0]!, { createClientName: 'Cà phê' });
  await assignAdAccount(ctx, ids[1]!, { createClientName: 'Nội thất' });
  const limited = await seedMember(db, workspace.id, 'manager', [r1.clientId!]);
  return { ctx, owner, limited, ids };
}

describe('digest tuần (P0-19, E03)', () => {
  it('gửi owner + manager theo phạm vi Client; chụp health; tuần sau có thay đổi; không gửi trùng', async () => {
    const { ctx, owner, limited, ids } = await setup();
    const email = memoryEmailSender();
    expect(await sendWeeklyDigest(ctx, '2026-10-26', { email, appUrl: 'http://app', clock })).toEqual({ sent: 2 });
    const toOwner = email.sent.find((m) => m.to === owner.email)!;
    const toLimited = email.sent.find((m) => m.to === limited.email)!;
    expect(toOwner.subject).toBe('Tổng kết tuần AdxLens · 26/10/2026');
    expect(toOwner.text).toContain('Cà phê Nhà Rang');
    expect(toOwner.text).toContain('Nội thất An Cư');
    expect(toOwner.text).toMatch(/\d+ vấn đề mới trong tuần/);
    // Manager chỉ xem Client "Cà phê" → không thấy tài khoản của Client khác.
    expect(toLimited.text).toContain('Cà phê Nhà Rang');
    expect(toLimited.text).not.toContain('Nội thất An Cư');
    const snaps = await db.select().from(schema.healthSnapshots);
    expect(snaps.map((s) => s.adAccountId).sort()).toEqual([...ids].sort());

    // Gọi lại cùng tuần → không gửi lại.
    expect(await sendWeeklyDigest(ctx, '2026-10-26', { email, appUrl: 'http://app', clock })).toEqual({ sent: 0 });

    // Tuần sau: có snapshot tuần trước → hiện thay đổi (+/−) khi health đổi.
    await db.update(schema.healthSnapshots).set({ score: 50 });
    const next = memoryEmailSender();
    await sendWeeklyDigest(ctx, '2026-11-02', { email: next, appUrl: 'http://app', clock });
    // Tuần trước 50 → tuần này khác 50 nên có (+n) hoặc (−n).
    expect(next.sent.find((m) => m.to === owner.email)!.text).toMatch(/Health \d+ \([+−]\d+\)/);
  });

  it('tắt email "Tổng kết tuần" → không gửi cho người đó', async () => {
    const { ctx, owner } = await setup();
    await updateNotificationSettings(ctx, owner.id, [{ kind: 'weekly_digest', inApp: false, email: false }]);
    const email = memoryEmailSender();
    await sendWeeklyDigest(ctx, '2026-10-26', { email, appUrl: 'http://app', clock });
    expect(email.sent.map((m) => m.to)).not.toContain(owner.email);
  });
});
