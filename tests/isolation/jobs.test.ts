import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { JOBS, type JobName } from '@adxlens/jobs';
import { testWorkerServices } from '../../apps/worker/src/testing';
import { handlers } from '../../apps/worker/src/handlers';
import { dispatch } from '../../apps/worker/src/dispatch';
import { workspaceFingerprint } from './fingerprint';
import { JOB_PROBES } from './job-probes';
import { seedWorld } from './world';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('cách ly workspace: job', () => {
  it('mọi job theo workspace có handler đều có probe', () => {
    const scoped = (Object.keys(handlers) as JobName[]).filter((n) => JOBS[n].workspaceScoped);
    const probed = new Set(Object.keys(JOB_PROBES).map((k) => k.split('#')[0]));
    const missing = scoped.filter((n) => !probed.has(n));
    expect(missing, 'Job mới chưa có probe trong tests/isolation/job-probes.ts').toEqual([]);
  });

  it('chạy job cho workspace A không đổi dữ liệu workspace B', async () => {
    for (const [name, probe] of Object.entries(JOB_PROBES)) {
      await truncateAll(db);
      const world = await seedWorld(db);
      const prepared = await probe.prepare?.(db, world);
      const before = await workspaceFingerprint(db, world.b.workspace.id);
      await dispatch(handlers, testWorkerServices(db).services, {
        name: name.split('#')[0]!,
        id: `probe-${name}`,
        data: probe.payload(world, prepared),
      }).catch(() => {
        /* lỗi của job A không phải là vi phạm cách ly; chỉ kiểm dữ liệu B */
      });
      const after = await workspaceFingerprint(db, world.b.workspace.id);
      expect(after, `${name} làm thay đổi dữ liệu workspace B`).toBe(before);
    }
  });
});
