import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@adxlens/config/env';
import { signRequest } from '@adxlens/core/connections';
import { closeTestDb, seedConnection, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as disconnect from './[id]/disconnect/route';
import * as webhook from '../webhooks/meta/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeAll(() => {
  process.env.META_APP_SECRET = 'test-app-secret';
  resetEnvCache();
});
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(async () => {
  delete process.env.META_APP_SECRET;
  resetEnvCache();
  await closeTestDb();
});

function form(signed: string) {
  return new Request('http://localhost/api/v1/webhooks/meta', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: signed }).toString(),
  });
}

describe('API ngắt kết nối và webhook Meta', () => {
  it('owner ngắt kết nối → mã xác nhận, hẹn purge, email; buyer 403', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const buyer = asUser(await seedMember(db, workspace.id, 'buyer'));
    const denied = await call(disconnect.POST, {
      user: buyer,
      workspaceId: workspace.id,
      params: { id: conn.id },
      method: 'POST',
    });
    expect(denied.status).toBe(403);
    const r = await call(disconnect.POST, {
      user: asUser(owner),
      workspaceId: workspace.id,
      params: { id: conn.id },
      method: 'POST',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ confirmation_code: expect.stringMatching(/^XD-/) });
    expect(server.enqueue.calls.map((c) => c.name)).toEqual(['maintenance:purge_connection_data']);
    expect(server.email.sent).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/ciphertext|token/i);
  });

  it('webhook: chữ ký đúng → thu hồi, trả url + confirmation_code; chữ ký sai → 403', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    await seedConnection(db, workspace.id, owner.id, 'meta-user-77');
    const ok = await webhook.POST(
      form(signRequest({ algorithm: 'HMAC-SHA256', user_id: 'meta-user-77' }, 'test-app-secret')),
      {
        params: Promise.resolve({}),
      },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toMatch(/^XD-/);
    expect(body.url).toContain(`/data-deletion?code=${body.confirmation_code}`);

    const bad = await webhook.POST(form(signRequest({ algorithm: 'HMAC-SHA256', user_id: 'meta-user-77' }, 'other')), {
      params: Promise.resolve({}),
    });
    expect(bad.status).toBe(403);
    const missing = await webhook.POST(form(''), { params: Promise.resolve({}) });
    expect(missing.status).toBeGreaterThanOrEqual(400);
  });
});
