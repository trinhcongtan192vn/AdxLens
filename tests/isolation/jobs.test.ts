import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@adxlens/db';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { JOBS, recordingEnqueue, type JobName } from '@adxlens/jobs';
import { handlers } from '../../apps/worker/src/handlers';
import { dispatch } from '../../apps/worker/src/dispatch';
import { JOB_PROBES } from './job-probes';
import { seedWorld } from './world';

/** Băm toàn bộ dữ liệu của một workspace trong mọi bảng có cột workspace_id. */
export async function workspaceFingerprint(db: Db, workspaceId: string): Promise<string> {
  const tables = await db.execute<{ fq: string }>(sql`
    select format('%I.%I', table_schema, table_name) as fq
    from information_schema.columns
    where table_schema in ('app','analytics') and column_name = 'workspace_id'
    order by 1
  `);
  const h = createHash('sha256');
  for (const t of tables) {
    const rows = await db.execute(sql.raw(`select * from ${t.fq} where workspace_id = '${workspaceId}' order by 1`));
    h.update(t.fq + JSON.stringify(rows));
  }
  return h.digest('hex');
}

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('cách ly workspace: job', () => {
  it('mọi job theo workspace có handler đều có probe', () => {
    const scoped = (Object.keys(handlers) as JobName[]).filter((n) => JOBS[n].workspaceScoped);
    const missing = scoped.filter((n) => !(n in JOB_PROBES));
    expect(missing, 'Job mới chưa có probe trong tests/isolation/job-probes.ts').toEqual([]);
  });

  it('chạy job cho workspace A không đổi dữ liệu workspace B', async () => {
    for (const [name, probe] of Object.entries(JOB_PROBES)) {
      await truncateAll(db);
      const world = await seedWorld(db);
      const prepared = await probe.prepare?.(db, world);
      const before = await workspaceFingerprint(db, world.b.workspace.id);
      await dispatch(
        handlers,
        { db, enqueue: recordingEnqueue() },
        {
          name,
          id: `probe-${name}`,
          data: probe.payload(world, prepared),
        },
      ).catch(() => {
        /* lỗi của job A không phải là vi phạm cách ly; chỉ kiểm dữ liệu B */
      });
      const after = await workspaceFingerprint(db, world.b.workspace.id);
      expect(after, `${name} làm thay đổi dữ liệu workspace B`).toBe(before);
    }
  });
});
