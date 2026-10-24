import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { memoryEmailSender } from '@adxlens/core/notification';
import {
  incidentDetail,
  listIncidents,
  openIncident,
  recordDeploySmoke,
  registerIncidentSink,
  resetIncidentSinks,
  runWorkerStuckPlaybook,
  teamAlertSink,
  type IncidentAlert,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterEach(() => resetIncidentSinks());
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  const action = async (status: 'executing' | 'pending', updatedAt: Date) =>
    (
      await db
        .insert(schema.actions)
        .values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          actionType: 'pause_ad',
          targetType: 'ad',
          targetMetaId: '1',
          tier: 'approve',
          params: {},
          beforeState: { status: 'ACTIVE' },
          afterExpected: { status: 'PAUSED' },
          status,
          idempotencyKey: `k-${Math.random()}`,
          updatedAt,
        })
        .returning()
    )[0]!;
  const run = async (startedAt: Date) =>
    (
      await db
        .insert(schema.syncRuns)
        .values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          kind: 'backfill',
          dateFrom: '2026-07-25',
          dateTo: '2026-10-22',
          status: 'running',
          startedAt,
        })
        .returning()
    )[0]!;
  return { action, run };
}

describe('playbook worker_stuck (L2 11.2)', () => {
  it('hành động kẹt > 15 phút → thất bại "kiểm tra thủ công" (không chạy lại lời gọi ghi), sự cố P1; đồng bộ kẹt → stalled', async () => {
    const s = await setup();
    const stuck = await s.action('executing', ago(20));
    const fresh = await s.action('executing', ago(5));
    const stalled = await s.run(ago(200));
    const r = await runWorkerStuckPlaybook(db, clock);
    expect(r).toEqual({ result: 'done', actions: 1, runs: 1 });
    const rows = await db.select().from(schema.actions);
    expect(rows.find((a) => a.id === stuck.id)).toMatchObject({ status: 'failed', resultCode: 'stuck_check_manually' });
    expect(rows.find((a) => a.id === fresh.id)!.status).toBe('executing');
    const [run] = await db.select().from(schema.syncRuns).where(eq(schema.syncRuns.id, stalled.id));
    expect(run).toMatchObject({ status: 'failed', error: 'stalled' });
    const [inc] = await listIncidents(db, {});
    expect(inc).toMatchObject({ kind: 'worker_stuck', severity: 'P1' });
    expect((await incidentDetail(db, inc!.id))!.runs.map((x) => x.result)).toEqual(['done']);
  });

  it('quá 3 lần / giờ → leo thang (không chạy nữa); hết kẹt → đóng sự cố', async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) {
      await s.run(ago(200));
      expect((await runWorkerStuckPlaybook(db, clock)).result).toBe('done');
    }
    await s.run(ago(200));
    expect((await runWorkerStuckPlaybook(db, clock)).result).toBe('escalated');
    await db.update(schema.syncRuns).set({ status: 'failed' });
    expect((await runWorkerStuckPlaybook(db, clock)).result).toBe('ok');
    expect((await listIncidents(db, { status: ['open'] })).filter((i) => i.kind === 'worker_stuck')).toEqual([]);
  });
});

describe('playbook deploy_smoke_failed', () => {
  it('smoke lỗi → sự cố P1 + lần chạy "leo thang (báo PM)"; smoke đạt → đóng', async () => {
    const r = await recordDeploySmoke(db, { appVersion: 'sha1', ok: false, failures: ['/pricing → 500'] }, clock);
    expect(r.incident).toMatchObject({ kind: 'deploy_smoke_failed', severity: 'P1', status: 'open' });
    expect((await incidentDetail(db, r.incident!.id))!.runs.map((x) => x.result)).toEqual(['escalated']);
    await recordDeploySmoke(db, { appVersion: 'sha2', ok: true, failures: [] }, clock);
    expect((await listIncidents(db, { status: ['open'] })).length).toBe(0);
  });
});

describe('kênh báo đội AdxLens', () => {
  it('sự cố P1/P2 mới hoặc vừa nâng mức → gửi; P3 và lần lặp cùng mức → không', async () => {
    const got: IncidentAlert[] = [];
    registerIncidentSink(async (a) => void got.push(a));
    const base = { kind: 'x', source: 'test', title: 'T', fingerprint: 'fp1' };
    await openIncident(db, { ...base, severity: 'P2' });
    await openIncident(db, { ...base, severity: 'P2' });
    await openIncident(db, { ...base, severity: 'P1' });
    await openIncident(db, { ...base, fingerprint: 'fp3', severity: 'P3' });
    expect(got.map((a) => [a.severity, a.escalated])).toEqual([
      ['P2', false],
      ['P1', true],
    ]);
  });

  it('email + Slack, chỉ mô tả chung; kênh lỗi không làm hỏng việc mở sự cố', async () => {
    const email = memoryEmailSender();
    const posts: string[] = [];
    registerIncidentSink(
      teamAlertSink({
        email,
        recipients: ['ops@adxlens.test'],
        slackWebhookUrl: 'https://hooks.slack.test/x',
        appUrl: 'http://localhost:3000',
        fetchImpl: (async (_u: string, init: RequestInit) => {
          posts.push(String(init.body));
          return new Response('ok');
        }) as typeof fetch,
      }),
    );
    registerIncidentSink(async () => {
      throw new Error('kênh hỏng');
    });
    const { incident } = await openIncident(db, {
      kind: 'execution_failed',
      severity: 'P1',
      source: 'execution',
      title: 'Hành động trên Meta thất bại',
      fingerprint: 'fp-x',
    });
    expect(email.sent[0]).toMatchObject({
      to: 'ops@adxlens.test',
      subject: '[AdxLens P1] Hành động trên Meta thất bại',
    });
    expect(email.sent[0]!.text).toContain(`/admin/incidents?id=${incident.id}`);
    expect(posts[0]).toContain('execution_failed');
  });
});
