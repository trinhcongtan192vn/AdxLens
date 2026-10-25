import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { keysFromEnv } from '@adxlens/core/connections';
import { schema } from '@adxlens/db';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { mockWriteState } from '@adxlens/meta-client/mock';
import { cleanupDrill, runIncidentDrill } from './drill';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
});
afterAll(() => closeTestDb());

describe('diễn tập 3 sự cố (B9)', () => {
  it('rate limit, đối chiếu lệch, thực thi lỗi: mỗi sự cố mở đúng và playbook chạy; dọn sạch sau đó', async () => {
    const keys = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 21).toString('base64') });
    const { workspaceId, steps } = await runIncidentDrill(db, { keys });
    expect(steps.map((s) => [s.step, s.ok])).toEqual([
      ['Meta rate limit', true],
      ['Đối chiếu lệch > 1%', true],
      ['Thực thi lỗi trên Meta', true],
    ]);
    await cleanupDrill(db, workspaceId);
    expect(await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId))).toEqual([]);
    const open = await db.select().from(schema.opsIncidents).where(eq(schema.opsIncidents.status, 'open'));
    expect(open).toEqual([]);
  });
});
