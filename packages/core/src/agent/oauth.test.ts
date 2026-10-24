import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { enableFlag } from '@adxlens/core/flags';
import {
  exchangeOAuthCode,
  getOAuthClient,
  refreshOAuthToken,
  registerOAuthClient,
  resolveOAuthToken,
  revokeOAuthToken,
  validRedirectUri,
} from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import { createAuthorizationCode, listOAuthGrants, oauthScopes, revokeOAuthGrant } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const VERIFIER = 'v'.repeat(20) + 'erifier-0123456789-abcdefghijk';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

async function setup(name = 'A', p1 = true) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  if (p1) {
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
  }
  return { ctx, workspaceId: workspace.id, owner };
}

async function client() {
  const c = await registerOAuthClient(db, { name: 'Claude', redirectUris: [REDIRECT] });
  if ('error' in c) throw new Error(c.error);
  return c;
}

const grantInput = (clientId: string) => ({
  clientId,
  clientName: 'Claude',
  redirectUri: REDIRECT,
  codeChallenge: CHALLENGE,
  scopes: oauthScopes('read'),
});

describe('OAuth cho connector MCP (ADR-0022 B)', () => {
  it('đăng ký client: chỉ https hoặc localhost, không fragment', async () => {
    expect(validRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(validRedirectUri('http://localhost:33418/callback')).toBe(true);
    expect(validRedirectUri('http://127.0.0.1:5000/cb')).toBe(true);
    expect(validRedirectUri('http://evil.example/cb')).toBe(false);
    expect(validRedirectUri('https://a.example/cb#x')).toBe(false);
    expect(validRedirectUri('javascript:alert(1)')).toBe(false);
    expect(await registerOAuthClient(db, { name: 'x', redirectUris: ['http://evil.example/cb'] })).toEqual({
      error: 'invalid_redirect_uri',
    });
    const c = await client();
    expect(c.clientId).toMatch(/^adxcl_/);
    expect(await getOAuthClient(db, c.clientId)).toMatchObject({ name: 'Claude', redirectUris: [REDIRECT] });
    expect(await getOAuthClient(db, 'adxcl_khongtontai00')).toBeNull();
  });

  it('cờ P1 tắt → không cấp quyền được', async () => {
    const { ctx } = await setup('A', false);
    const c = await client();
    await expect(createAuthorizationCode(ctx, grantInput(c.clientId))).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('mã dùng một lần + PKCE + đúng client / redirect_uri; access → workspace + người cấp; refresh xoay', async () => {
    const { ctx, workspaceId, owner } = await setup();
    const c = await client();
    const other = await client();
    const code = await createAuthorizationCode(ctx, grantInput(c.clientId));
    const ex = (o: Partial<Parameters<typeof exchangeOAuthCode>[1]>) =>
      exchangeOAuthCode(db, { code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER, ...o });
    expect(await ex({ codeVerifier: 'x'.repeat(43) })).toEqual({ error: 'invalid_grant' });
    expect(await ex({ clientId: other.clientId })).toEqual({ error: 'invalid_grant' });
    expect(await ex({ redirectUri: 'https://claude.ai/other' })).toEqual({ error: 'invalid_grant' });
    // Hết hạn sau 10 phút.
    expect(
      await exchangeOAuthCode(
        db,
        { code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
        new Date(Date.now() + 11 * 60_000),
      ),
    ).toEqual({ error: 'invalid_grant' });

    const tok = await ex({});
    if ('error' in tok) throw new Error(tok.error);
    expect(tok).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read' });
    // Dùng lại mã → bị từ chối.
    expect(await ex({})).toEqual({ error: 'invalid_grant' });

    expect(await resolveOAuthToken(db, tok.access_token)).toMatchObject({
      workspaceId,
      userId: owner.id,
      scopes: ['read'],
      name: 'Claude',
    });
    expect(await resolveOAuthToken(db, tok.access_token, new Date(Date.now() + 2 * 3600_000))).toBeNull();
    expect(await resolveOAuthToken(db, tok.refresh_token)).toBeNull();

    expect(await refreshOAuthToken(db, { refreshToken: tok.refresh_token, clientId: other.clientId })).toEqual({
      error: 'invalid_grant',
    });
    const tok2 = await refreshOAuthToken(db, { refreshToken: tok.refresh_token, clientId: c.clientId });
    if ('error' in tok2) throw new Error(tok2.error);
    expect(tok2.access_token).not.toBe(tok.access_token);
    // Token cũ (access + refresh) hết dùng được sau khi xoay.
    expect(await resolveOAuthToken(db, tok.access_token)).toBeNull();
    expect(await refreshOAuthToken(db, { refreshToken: tok.refresh_token, clientId: c.clientId })).toEqual({
      error: 'invalid_grant',
    });
    expect(await resolveOAuthToken(db, tok2.access_token)).not.toBeNull();

    // RFC 7009: thu hồi bằng refresh token → cả grant.
    await revokeOAuthToken(db, tok2.refresh_token);
    expect(await resolveOAuthToken(db, tok2.access_token)).toBeNull();
    await revokeOAuthToken(db, 'rác');
  });

  it('danh sách / thu hồi: buyer chỉ thấy và thu hồi grant của mình; workspace khác không thu hồi được', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const c = await client();
    const buyer = await seedMember(db, a.workspaceId, 'buyer');
    const bctx = { ...a.ctx, actor: (await resolveActor(db, a.workspaceId, buyer.id))! };
    const issue = async (ctx: typeof a.ctx) => {
      const code = await createAuthorizationCode(ctx, grantInput(c.clientId));
      const t = await exchangeOAuthCode(db, {
        code,
        clientId: c.clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });
      if ('error' in t) throw new Error(t.error);
      return t;
    };
    const ownerTok = await issue(a.ctx);
    const buyerTok = await issue(bctx);
    // Mã chưa đổi thì chưa hiện trong danh sách.
    await createAuthorizationCode(a.ctx, grantInput(c.clientId));

    const all = await listOAuthGrants(a.ctx);
    expect(all).toHaveLength(2);
    const mineB = await listOAuthGrants(bctx);
    expect(mineB).toHaveLength(1);
    expect(mineB[0]).toMatchObject({ mine: true, clientName: 'Claude' });
    const ownerGrant = all.find((g) => g.mine)!;
    await expect(revokeOAuthGrant(bctx, ownerGrant.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(revokeOAuthGrant(b.ctx, ownerGrant.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await listOAuthGrants(b.ctx)).toHaveLength(0);

    await revokeOAuthGrant(a.ctx, mineB[0]!.id);
    expect(await resolveOAuthToken(db, buyerTok.access_token)).toBeNull();
    expect(await resolveOAuthToken(db, ownerTok.access_token)).not.toBeNull();
  });

  it('phạm vi: luôn có read, bỏ giá trị lạ', () => {
    expect(oauthScopes(undefined)).toEqual(['read']);
    expect(oauthScopes('propose admin')).toEqual(['read', 'propose']);
  });
});
