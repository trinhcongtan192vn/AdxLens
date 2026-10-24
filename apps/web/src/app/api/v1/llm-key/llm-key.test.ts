import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as route from './route';
import * as apiKeys from '../api-keys/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const KEY = 'sk-ant-api03-routeTESTAAAAAAAAAAAAAAAA9z9z';

describe('/api/v1/llm-key (ADR-0022)', () => {
  it('cờ P1 tắt → 404 (cả khóa API MCP); bật → lưu, đọc lại không có khóa rõ, xóa', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = { user: asUser(owner), workspaceId: workspace.id };
    expect((await call(route.GET, u)).status).toBe(404);
    expect((await call(apiKeys.GET, u)).status).toBe(404);

    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test llm key',
        override: true,
      });
    }
    expect((await call(route.GET, u)).body).toEqual({ key: null });
    const put = await call(route.PUT, {
      ...u,
      method: 'PUT',
      body: { provider: 'anthropic', model: 'claude-sonnet-5-5', api_key: KEY },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ key: { provider: 'anthropic', model: 'claude-sonnet-5-5', key_hint: '9z9z' } });
    const got = await call(route.GET, u);
    expect(JSON.stringify(got.body)).not.toContain(KEY);
    expect(got.body).toMatchObject({ key: { key_hint: '9z9z', last_error: null } });

    const bad = await call(route.PUT, {
      ...u,
      method: 'PUT',
      body: { provider: 'openai', model: 'gpt-5', api_key: 'nope' },
    });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).not.toContain('nope');

    expect((await call(route.DELETE, { ...u, method: 'DELETE' })).status).toBe(204);
    expect((await call(route.GET, u)).body).toEqual({ key: null });
  });
});
