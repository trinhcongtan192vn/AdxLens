import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as keyRoute from '../llm-key/route';
import * as route from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const ANT = 'sk-ant-api03-routesTESTAAAAAAAAAAAAAAA1a1a';
const OAI = 'sk-proj-routesTESTBBBBBBBBBBBBBBBBB2b2b';

describe('/api/v1/llm-routes (ADR-0030)', () => {
  it('cờ P1 tắt → 404; hai khóa → mọi khóa + tuyến mặc định; chọn / bỏ model theo việc', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = { user: asUser(owner), workspaceId: workspace.id };
    expect((await call(route.GET, u)).status).toBe(404);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test routes',
        override: true,
      });
    }
    for (const [provider, model, api_key] of [
      ['openai', 'gpt-5', OAI],
      ['anthropic', 'claude-sonnet-5-5', ANT],
    ] as const) {
      expect((await call(keyRoute.PUT, { ...u, method: 'PUT', body: { provider, model, api_key } })).status).toBe(200);
    }
    const got = await call(route.GET, u);
    expect(JSON.stringify(got.body)).not.toContain(OAI);
    expect(got.body).toMatchObject({
      keys: [
        { provider: 'anthropic', key_hint: '1a1a' },
        { provider: 'openai', key_hint: '2b2b' },
      ],
      routes: [
        { task: 'analysis', provider: 'anthropic', source: 'default' },
        { task: 'copywriting', provider: 'anthropic', source: 'default' },
        { task: 'image', provider: 'openai', model: 'gpt-image-1', source: 'default' },
      ],
    });

    const put = await call(route.PUT, {
      ...u,
      method: 'PUT',
      body: { task: 'copywriting', provider: 'openai', model: 'gpt-5-mini' },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      routes: expect.arrayContaining([
        expect.objectContaining({ task: 'copywriting', provider: 'openai', source: 'route' }),
      ]),
    });
    const bad = await call(route.PUT, {
      ...u,
      method: 'PUT',
      body: { task: 'image', provider: 'anthropic', model: 'claude-sonnet-5-5' },
    });
    expect(bad.status).toBe(422);

    const del = await call(route.DELETE, { ...u, method: 'DELETE', path: '/api/v1/llm-routes?task=copywriting' });
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({
      routes: expect.arrayContaining([expect.objectContaining({ task: 'copywriting', source: 'default' })]),
    });

    // Xóa khóa một nhà cung cấp qua llm-key → ảnh không còn tuyến.
    expect(
      (await call(keyRoute.DELETE, { ...u, method: 'DELETE', path: '/api/v1/llm-key?provider=openai' })).status,
    ).toBe(204);
    const after = await call(route.GET, u);
    expect((after.body as { routes: { task: string }[] }).routes.map((r) => r.task)).toEqual([
      'analysis',
      'copywriting',
    ]);
  });
});
