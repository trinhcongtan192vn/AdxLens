import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { memoryEmailSender } from '@adxlens/core/notification';
import { metaRateLimitRatio, RATE_LIMIT_PAUSE_MS, remediateHealth, runTokenExpiringPlaybook } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const NOW = new Date('2026-10-23T02:00:00Z');
const clock = { now: () => NOW };

async function connectionExpiringIn(days: number | null) {
  const { workspace, owner } = await seedWorkspace(db, 'Agency Hết Hạn');
  const c = await seedConnection(db, workspace.id, owner.id);
  await db
    .update(schema.metaConnections)
    .set({ expiresAt: days === null ? null : new Date(NOW.getTime() + days * 86_400_000) })
    .where(eq(schema.metaConnections.id, c.id));
  return { connectionId: c.id, owner };
}

describe('playbook token_expiring', () => {
  it('sắp hết hạn trong 7 ngày → email người kết nối, 1 lần/ngày', async () => {
    const { owner } = await connectionExpiringIn(3);
    await connectionExpiringIn(30); // còn xa: bỏ qua
    await connectionExpiringIn(null); // không có hạn: bỏ qua
    const email = memoryEmailSender();
    const deps = { email, appUrl: 'http://app', clock };
    expect(await runTokenExpiringPlaybook(db, deps)).toEqual({ notified: 1, expired: 0, skipped: 0 });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: owner.email });
    expect(email.sent[0]!.subject).toContain('hết hạn sau 3 ngày');
    expect(email.sent[0]!.text).toContain('http://app/connections');
    // Lần 2 trong ngày: vượt giới hạn → không gửi lại.
    expect(await runTokenExpiringPlaybook(db, deps)).toEqual({ notified: 0, expired: 0, skipped: 1 });
    expect(email.sent).toHaveLength(1);
  });

  it('đã quá hạn → kết nối hết hạn, sự cố P3, email báo đã hết hạn', async () => {
    const { connectionId } = await connectionExpiringIn(-1);
    const email = memoryEmailSender();
    expect(await runTokenExpiringPlaybook(db, { email, appUrl: 'http://app', clock })).toMatchObject({
      expired: 1,
      notified: 1,
    });
    const [c] = await db.select().from(schema.metaConnections).where(eq(schema.metaConnections.id, connectionId));
    expect(c!.status).toBe('expired');
    const [inc] = await db.select().from(schema.opsIncidents);
    expect(inc).toMatchObject({ kind: 'token_expired', severity: 'P3' });
    expect(email.sent[0]!.subject).toContain('đã hết hạn');
    // Email không chứa token hay ciphertext.
    expect(JSON.stringify(email.sent)).not.toMatch(/ciphertext|access_token/);
  });
});

describe('playbook meta_rate_limited', () => {
  async function audit(total: number, limited: number) {
    const rows = Array.from({ length: total }, (_, i) => ({
      endpoint: '/act_1/insights',
      durationMs: 100,
      status: i < limited ? 400 : 200,
      errorCode: i < limited ? 17 : null,
      at: new Date(NOW.getTime() - 60_000),
    }));
    await db.insert(schema.jobAudit).values(rows);
  }

  it('dưới 20 lời gọi hoặc ≤ 20% → ổn', async () => {
    await audit(10, 10);
    expect((await metaRateLimitRatio(db, clock)).ok).toBe(true);
    await audit(90, 10); // 20/100 = 20%
    expect((await metaRateLimitRatio(db, clock)).ok).toBe(true);
  });

  it('> 20% bị rate limit → hoãn queue sync 15 phút; quá 3 lần/giờ → leo thang', async () => {
    await audit(25, 10);
    const health = await metaRateLimitRatio(db, clock);
    expect(health).toMatchObject({ ok: false, detail: { total: 25, limited: 10 } });
    const throttled: number[] = [];
    const actions = { throttleQueue: async (_q: 'sync', ms: number) => void throttled.push(ms) };
    const results = { meta_rate_limit: health };
    for (let i = 0; i < 3; i++) {
      expect(await remediateHealth(db, results, actions, clock)).toEqual({ meta_rate_limited: 'done' });
    }
    expect(await remediateHealth(db, results, actions, clock)).toEqual({ meta_rate_limited: 'escalated' });
    expect(throttled).toEqual([RATE_LIMIT_PAUSE_MS, RATE_LIMIT_PAUSE_MS, RATE_LIMIT_PAUSE_MS]);
    const [n] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.ops_playbook_runs where playbook = 'meta_rate_limited'`,
    );
    expect(n!.n).toBe(4);
  });

  it('kiểm tra ổn → không chạy playbook', async () => {
    expect(await remediateHealth(db, { meta_rate_limit: { ok: true } }, { throttleQueue: async () => {} })).toEqual({});
  });
});
