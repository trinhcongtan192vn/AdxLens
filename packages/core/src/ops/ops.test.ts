import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import {
  canRunPlaybook,
  listIncidents,
  openIncident,
  openP1Count,
  registerHealthCheck,
  resetHealthChecks,
  runHealthChecks,
  runPlaybook,
  setIncidentStatus,
} from './index';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  resetHealthChecks();
});
afterAll(() => closeTestDb());

const base = {
  kind: 'reconcile_warning',
  severity: 'P2' as const,
  source: 'reconcile',
  title: 'Lệch',
};

describe('sự cố', () => {
  it('gom sự cố trùng fingerprint khi đang mở', async () => {
    const a = await openIncident(db, { ...base, fingerprint: 'fp1' });
    const b = await openIncident(db, { ...base, fingerprint: 'fp1' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.incident.occurrences).toBe(2);
    await setIncidentStatus(db, a.incident.id, 'resolved');
    const c = await openIncident(db, { ...base, fingerprint: 'fp1' });
    expect(c.created).toBe(true);
    expect(await listIncidents(db, { status: ['open'] })).toHaveLength(1);
  });

  it('đếm P1 đang mở theo workspace', async () => {
    const ws = '11111111-1111-4111-8111-111111111111';
    await openIncident(db, { ...base, severity: 'P1', fingerprint: 'x', workspaceId: ws });
    await openIncident(db, { ...base, severity: 'P1', fingerprint: 'y' });
    expect(await openP1Count(db, ws)).toBe(1);
  });
});

describe('playbook có giới hạn (L2 11.2)', () => {
  it('reconcile_retry chỉ 1 lần/ngày/account, lần sau leo thang', async () => {
    const run = () => runPlaybook(db, { playbook: 'reconcile_retry', scopeKey: 'acc-1' }, async () => {});
    expect(await run()).toBe('done');
    expect(await run()).toBe('escalated');
    expect(await runPlaybook(db, { playbook: 'reconcile_retry', scopeKey: 'acc-2' }, async () => {})).toBe('done');
  });

  it('hết cửa sổ thời gian thì chạy lại được', async () => {
    const t0 = new Date('2026-10-22T00:00:00Z');
    await runPlaybook(db, { playbook: 'reconcile_retry', scopeKey: 'a' }, async () => {}, {
      now: () => t0,
    });
    const later = { now: () => new Date(t0.getTime() + 25 * 3_600_000) };
    expect(await canRunPlaybook(db, 'reconcile_retry', 'a', later)).toBe(true);
  });

  it('playbook lỗi được ghi failed, không ném ra ngoài', async () => {
    const r = await runPlaybook(db, { playbook: 'meta_rate_limited', scopeKey: 'app' }, async () => {
      throw new Error('x');
    });
    expect(r).toBe('failed');
  });

  it('playbook không khai báo thì không bao giờ chạy', async () => {
    expect(await canRunPlaybook(db, 'disable_guardrails', 'x')).toBe(false);
  });
});

describe('health check', () => {
  it('database ok; kiểm tra lỗi mở sự cố với mức của nó', async () => {
    registerHealthCheck({
      name: 'queue_backlog',
      severity: 'P2',
      run: async () => ({ ok: false, detail: { backlog: 150 } }),
    });
    const r = await runHealthChecks(db);
    expect(r.database?.ok).toBe(true);
    expect(r.queue_backlog?.ok).toBe(false);
    const [inc] = await listIncidents(db);
    expect(inc).toMatchObject({ kind: 'health:queue_backlog', severity: 'P2' });
  });

  it('kiểm tra ném lỗi được coi là thất bại', async () => {
    registerHealthCheck({
      name: 'boom',
      severity: 'P3',
      run: async () => {
        throw new Error('down');
      },
    });
    expect((await runHealthChecks(db)).boom?.ok).toBe(false);
  });
});
