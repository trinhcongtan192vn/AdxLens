import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { resolveActor } from '@adxlens/core/tenancy';
import { keysFromEnv, reencryptWorkspaceTokens, saveConnection, withConnectionToken } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const V1 = Buffer.alloc(32, 1).toString('base64');
const V2 = Buffer.alloc(32, 2).toString('base64');

describe('xoay khóa mã hóa token (L3 5.4)', () => {
  it('mã hóa lại bằng khóa mới, token đọc lại đúng; chạy lại không đổi gì; không chạm workspace khác', async () => {
    const make = async () => {
      const { workspace, owner } = await seedWorkspace(db);
      const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
      const { connectionId } = await saveConnection(
        ctx,
        {
          token: `EAAG-token-${workspace.id}`,
          expiresAt: null,
          scopes: ['ads_read'],
          metaUser: { id: 'm' },
          accounts: MOCK_ACCOUNTS,
        },
        keysFromEnv({ TOKEN_ENC_KEY_V1: V1 }),
      );
      return { ctx, connectionId, token: `EAAG-token-${workspace.id}` };
    };
    const a = await make();
    const b = await make();
    const both = keysFromEnv({ TOKEN_ENC_KEY_V1: V1, TOKEN_ENC_KEY_V2: V2 });
    expect(await reencryptWorkspaceTokens(a.ctx, both)).toEqual({ rotated: 1, skipped: 0 });
    const [ca] = await db.select().from(schema.metaConnections).where(eq(schema.metaConnections.id, a.connectionId));
    expect(ca!.tokenKeyVersion).toBe(2);
    expect(await withConnectionToken(a.ctx, a.connectionId, both.keys, async (t) => t)).toBe(a.token);
    expect(await reencryptWorkspaceTokens(a.ctx, both)).toEqual({ rotated: 0, skipped: 1 });
    const [cb] = await db.select().from(schema.metaConnections).where(eq(schema.metaConnections.id, b.connectionId));
    expect(cb!.tokenKeyVersion).toBe(1);
  });
});
