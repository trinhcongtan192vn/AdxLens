import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveApiKey } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import { createApiKey, handleMcp, hashApiKey, listApiKeys, revokeApiKey } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');

async function setup(name = 'A', flags: ('p1_recommendations' | 'p2a_approve')[] = ['p1_recommendations']) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', ...flags] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test mcp', override: true });
  }
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-mcp',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `mc${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  return { ctx, id: a!.adAccountId, workspaceId: workspace.id };
}

const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
});

describe('khóa API MCP (ADR-0020)', () => {
  it('tạo: khóa rõ trả 1 lần, chỉ lưu SHA-256; danh sách không có hash; buyer không tạo được; thu hồi', async () => {
    const { ctx, workspaceId } = await setup();
    const k = await createApiKey(ctx, { name: 'Claude Desktop', scopes: ['read'] });
    expect(k.key).toMatch(/^adx_[\w-]{8}_[\w-]{20,}$/);
    const rows = await db.execute<Record<string, unknown>>(
      sql`select * from app.api_keys where workspace_id = ${workspaceId}`,
    );
    expect(JSON.stringify(rows)).not.toContain(k.key);
    expect(rows[0]!.hash).toBe(createHash('sha256').update(k.key).digest('hex'));
    expect(hashApiKey(k.key)).toBe(rows[0]!.hash);
    const list = await listApiKeys(ctx);
    expect(Object.keys(list[0]!)).not.toContain('hash');
    const audit = await db.execute<{ event: string }>(
      sql`select event from app.audit_events where workspace_id = ${workspaceId}`,
    );
    expect(audit.map((a) => a.event)).toContain('api_key.created');
    const buyer = await seedMember(db, workspaceId, 'buyer');
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    await expect(createApiKey(bctx, { name: 'x', scopes: ['read'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await resolveApiKey(db, k.key)).toMatchObject({ workspaceId, scopes: ['read'] });
    expect(await resolveApiKey(db, 'adx_bad')).toBeNull();
    await revokeApiKey(ctx, k.id);
    expect(await resolveApiKey(db, k.key)).toBeNull();
  });

  it('cờ P1 tắt → mọi lời gọi bị từ chối', async () => {
    const { ctx } = await setup('off', []);
    const r = await handleMcp(ctx, { name: 'k', scopes: ['read'] }, rpc('tools/list'));
    expect(r).toMatchObject({ error: { code: -32001 } });
  });

  it('initialize / tools/list / tools/call trả số đã tính; notification không phản hồi', async () => {
    const { ctx, id } = await setup();
    const key = { name: 'k', scopes: ['read'] };
    expect(await handleMcp(ctx, key, rpc('initialize', { protocolVersion: '2025-06-18' }))).toMatchObject({
      result: { protocolVersion: '2025-06-18', serverInfo: { name: 'adxlens' }, capabilities: { tools: {} } },
    });
    expect(await handleMcp(ctx, key, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list = (await handleMcp(ctx, key, rpc('tools/list'))) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain('account_kpis');
    expect(list.result.tools.map((t) => t.name)).not.toContain('propose_action');
    const call = (await handleMcp(
      ctx,
      key,
      rpc('tools/call', { name: 'account_kpis', arguments: { account_id: id, period: 'last7' } }),
      now(),
    )) as { result: { isError: boolean; structuredContent: { result: { metrics: { spend: { current: string } } } } } };
    expect(call.result.isError).toBe(false);
    const [raw] = await db.execute<{ spend: string }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where ad_account_id = ${id} and date between '2026-10-16' and '2026-10-22'`);
    expect(Number(call.result.structuredContent.result.metrics.spend.current)).toBe(Number(raw!.spend));
    expect(await handleMcp(ctx, key, rpc('resources/list'))).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcp(ctx, key, [rpc('ping')])).toMatchObject({ error: { code: -32600 } });
  });

  it('cách ly: khóa của A không đọc được tài khoản của B', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const r = (await handleMcp(
      a.ctx,
      { name: 'k', scopes: ['read'] },
      rpc('tools/call', { name: 'account_kpis', arguments: { account_id: b.id } }),
    )) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain(b.workspaceId);
  });

  it('propose_action: cần phạm vi "propose" VÀ cờ P2a; chỉ tạo thẻ đề xuất trong AI Agents, không tạo action', async () => {
    const { ctx, id } = await setup('p2', ['p1_recommendations', 'p2a_approve']);
    const read = (await handleMcp(ctx, { name: 'k', scopes: ['read'] }, rpc('tools/list'))) as {
      result: { tools: { name: string }[] };
    };
    expect(read.result.tools.map((t) => t.name)).not.toContain('propose_action');
    const key = { name: 'Claude', scopes: ['read', 'propose'] };
    const [ad] = await db.execute<{ meta_id: string }>(
      sql`select meta_id from analytics.entities where ad_account_id = ${id} and entity_type = 'ad' limit 1`,
    );
    const r = (await handleMcp(
      ctx,
      key,
      rpc('tools/call', {
        name: 'propose_action',
        arguments: { action_type: 'pause_ad', account_id: id, target_meta_id: ad!.meta_id },
      }),
    )) as { result: { isError: boolean } };
    expect(r.result.isError).toBe(false);
    const msgs = await db.execute<{ data: { proposals: { actionType: string }[] } }>(sql`
      select m.data from app.agent_messages m join app.agent_threads t on t.id = m.thread_id
      where m.workspace_id = ${ctx.workspaceId} and t.title = 'MCP · Claude'`);
    expect(msgs[0]!.data.proposals[0]!.actionType).toBe('pause_ad');
    const [n] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.actions where workspace_id = ${ctx.workspaceId}`,
    );
    expect(n!.n).toBe(0);
  });
});
