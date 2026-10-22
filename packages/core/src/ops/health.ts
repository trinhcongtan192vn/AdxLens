import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { openIncident, type Severity } from './incidents';

export type HealthResult = { ok: boolean; detail?: Record<string, unknown> };

export type HealthCheck = {
  name: string;
  severity: Severity;
  run: (db: DbOrTx) => Promise<HealthResult>;
};

const checks = new Map<string, HealthCheck>();

/** Module đăng ký tín hiệu sức khỏe của mình (L2 11.1 mức 1: phát hiện). */
export function registerHealthCheck(check: HealthCheck): void {
  checks.set(check.name, check);
}

export function resetHealthChecks(): void {
  checks.clear();
  registerHealthCheck(databaseCheck);
}

export const databaseCheck: HealthCheck = {
  name: 'database',
  severity: 'P1',
  run: async (db) => {
    await db.execute(sql`select 1`);
    return { ok: true };
  },
};
registerHealthCheck(databaseCheck);

/** Job `ops:health_check` (mỗi 5 phút): chạy mọi kiểm tra; kiểm tra lỗi → mở sự cố. */
export async function runHealthChecks(db: DbOrTx): Promise<Record<string, HealthResult>> {
  const out: Record<string, HealthResult> = {};
  for (const c of checks.values()) {
    let r: HealthResult;
    try {
      r = await c.run(db);
    } catch (e) {
      r = { ok: false, detail: { error: e instanceof Error ? e.name : 'unknown' } };
    }
    out[c.name] = r;
    if (!r.ok) {
      await openIncident(db, {
        kind: `health:${c.name}`,
        severity: c.severity,
        source: 'health_check',
        title: `Kiểm tra sức khỏe thất bại: ${c.name}`,
        fingerprint: `health:${c.name}`,
        detail: r.detail ?? {},
      });
    }
  }
  return out;
}
