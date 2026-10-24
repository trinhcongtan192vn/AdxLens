import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as protectedResource from '../../../.well-known/oauth-protected-resource/[[...rest]]/route';
import * as authServer from '../../../.well-known/oauth-authorization-server/[[...rest]]/route';
import * as mcp from '../mcp/route';
import * as authorize from './authorize/route';
import * as grants from './grants/route';
import * as register from './register/route';
import * as revoke from './revoke/route';
import * as token from './token/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const VERIFIER = 'test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

/** Token endpoint nhận form-urlencoded (RFC 6749). */
async function postForm(handler: typeof token.POST, form: Record<string, string>) {
  const res = await handler(
    new Request('http://localhost/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }),
    { params: Promise.resolve({}) },
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

describe('OAuth connector MCP qua HTTP (ADR-0022 B)', () => {
  it('discovery → 401 có WWW-Authenticate → đăng ký → cấp quyền → token → MCP → thu hồi', async () => {
    const pr = await call(protectedResource.GET, {});
    expect(pr.body).toMatchObject({ resource: expect.stringMatching(/\/api\/v1\/mcp$/) });
    const as = await call(authServer.GET, {});
    expect(as.body).toMatchObject({
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      authorization_endpoint: expect.stringMatching(/\/oauth\/authorize$/),
    });

    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const anon = await call(mcp.POST, { body: init });
    expect(anon.status).toBe(401);
    expect(anon.headers.get('www-authenticate')).toMatch(
      /resource_metadata=".*\/.well-known\/oauth-protected-resource"/,
    );

    const reg = await call(register.POST, { body: { client_name: 'Claude', redirect_uris: [REDIRECT] } });
    expect(reg.status).toBe(201);
    const clientId = (reg.body as { client_id: string }).client_id;
    expect((await call(register.POST, { body: { redirect_uris: ['http://evil.example/cb'] } })).status).toBe(400);

    const { workspace, owner } = await seedWorkspace(db);
    const u = { user: asUser(owner), workspaceId: workspace.id };
    const consent = {
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      state: 'xyz',
      decision: 'allow',
    };
    // Cờ P1 tắt → không cấp quyền.
    expect((await call(authorize.POST, { ...u, body: consent })).status).toBe(404);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test oauth',
        override: true,
      });
    }
    // redirect_uri không đăng ký → từ chối (không open redirect).
    expect(
      (await call(authorize.POST, { ...u, body: { ...consent, redirect_uri: 'https://evil.example/cb' } })).status,
    ).toBe(422);
    const ok = await call(authorize.POST, { ...u, body: consent });
    const redirect = new URL((ok.body as { redirect: string }).redirect);
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get('state')).toBe('xyz');
    const code = redirect.searchParams.get('code')!;

    expect(
      (
        await postForm(token.POST, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: 'sai'.repeat(15),
        })
      ).body,
    ).toEqual({ error: 'invalid_grant' });
    const tok = await postForm(token.POST, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
    });
    expect(tok.status).toBe(200);
    const access = tok.body.access_token as string;
    expect((await postForm(token.POST, { grant_type: 'password', client_id: clientId })).body).toEqual({
      error: 'unsupported_grant_type',
    });

    const res = await call(mcp.POST, { body: init, headers: { authorization: `Bearer ${access}` } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: { serverInfo: { name: 'adxlens' } } });

    const listed = await call(grants.GET, u);
    const items = (listed.body as { items: { id: string; client_name: string }[] }).items;
    expect(items).toMatchObject([{ client_name: 'Claude' }]);
    expect(JSON.stringify(listed.body)).not.toContain(access);

    await postForm(revoke.POST, { token: tok.body.refresh_token as string });
    expect((await call(mcp.POST, { body: init, headers: { authorization: `Bearer ${access}` } })).status).toBe(401);
  });
});
