import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { dispatch, UnknownJobError } from './dispatch';
import { handlers } from './handlers';

const db = testDb();
const deps = { db, enqueue: recordingEnqueue() };
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('dispatch', () => {
  it('job không có trong danh mục bị từ chối', async () => {
    await expect(dispatch(handlers, deps, { name: 'evil:run', id: '1', data: {} })).rejects.toBeInstanceOf(
      UnknownJobError,
    );
  });

  it('payload sai schema bị từ chối trước khi chạy handler', async () => {
    await expect(dispatch(handlers, deps, { name: 'ops:health_check', id: '1', data: { tick: 5 } })).rejects.toThrow();
  });

  it('ops:health_check chạy kiểm tra sức khỏe', async () => {
    const r = (await dispatch(handlers, deps, {
      name: 'ops:health_check',
      id: '1',
      data: { tick: 'now' },
    })) as Record<string, { ok: boolean }>;
    expect(r.database?.ok).toBe(true);
  });
});
