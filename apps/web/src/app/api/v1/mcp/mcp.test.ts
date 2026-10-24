import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as keys from '../api-keys/route';
import * as mcp from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('MCP endpoint (ADR-0020)', () => {
  it('không có / sai khóa → 401; khóa hợp lệ → initialize; thu hồi → 401', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test mcp route', override: true });
    }
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    expect((await call(mcp.POST, { body })).status).toBe(401);
    expect(
      (await call(mcp.POST, { body, headers: { authorization: 'Bearer adx_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy' } }))
        .status,
    ).toBe(401);

    const created = await call(keys.POST, {
      user: asUser(owner),
      workspaceId: workspace.id,
      body: { name: 'Claude', scopes: ['read'] },
    });
    const { key, id } = created.body as { key: string; id: string };
    const ok = await call(mcp.POST, { body, headers: { authorization: `Bearer ${key}` } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'adxlens' } } });
    const note = await call(mcp.POST, {
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
      headers: { authorization: `Bearer ${key}` },
    });
    expect(note.status).toBe(202);

    const listed = await call(keys.GET, { user: asUser(owner), workspaceId: workspace.id });
    expect(JSON.stringify(listed.body)).not.toContain(key);

    await call((await import('../api-keys/[id]/route')).DELETE, {
      method: 'DELETE',
      user: asUser(owner),
      workspaceId: workspace.id,
      params: { id },
    });
    expect((await call(mcp.POST, { body, headers: { authorization: `Bearer ${key}` } })).status).toBe(401);
  });
});
