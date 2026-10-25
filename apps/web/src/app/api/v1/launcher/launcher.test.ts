import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { mockWriteState, MockMetaRead, MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { setSubscription } from '@adxlens/core/billing';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  saveConnection,
  setWriteEnabled,
} from '@adxlens/core/connections';
import { enableFlag } from '@adxlens/core/flags';
import { GUARDRAIL_DEFAULTS, saveGuardrails } from '@adxlens/core/execution';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { launcherSources } from '@adxlens/core/reporting';
import { resolveActor } from '@adxlens/core/tenancy';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as ads from './ads/route';

const db = testDb();
afterAll(() => closeTestDb());
afterEach(() => uninstallTestServer());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 15).toString('base64') });
const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };

beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
  installTestServer(db);
});

async function setup(opts: { write?: boolean } = {}) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-launch',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `l-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client L' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(clock.now),
    keys: KEYS.keys,
    clock,
  });
  if (opts.write !== false) await setWriteEnabled(ctx, connectionId, true);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test launch', override: true });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const sources = await launcherSources(ctx, adAccountId);
  const [creative] = await db
    .select({ metaId: schema.entities.metaId })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'creative')))
    .limit(1);
  return { ctx, owner, workspaceId: workspace.id, adAccountId, sources, creativeId: creative!.metaId };
}

describe('/api/v1/launcher/ads (ADR-0023)', () => {
  it('nhiều nhóm QC × creative → mỗi cặp một hành động; hết hạn mức giữa chừng → dừng, trả số đã tạo', async () => {
    const s = await setup();
    const u = { user: asUser(s.owner), workspaceId: s.workspaceId };
    const adsetIds = s.sources.adsets.slice(0, 3).map((a) => a.metaId);
    const ok = await call(ads.POST, {
      ...u,
      body: { adAccountId: s.adAccountId, adsetIds: adsetIds.slice(0, 2), creativeIds: [s.creativeId], name: 'Linh' },
    });
    expect(ok.status).toBe(200);
    expect((ok.body as { action_ids: string[] }).action_ids).toHaveLength(2);
    const names = (await db.select({ p: schema.actions.params }).from(schema.actions)).map((r) => r.p.name);
    expect(names.sort()).toEqual(['Linh #1', 'Linh #2']);
    // Hạn mức 3 hành động / ngày (chặt hơn mặc định): đã có 2 → lần sau tạo 1 rồi dừng.
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [], maxActionsPerDay: 3 });
    const part = await call(ads.POST, {
      ...u,
      body: { adAccountId: s.adAccountId, adsetIds, creativeIds: [s.creativeId], name: 'Lần 2' },
    });
    expect(part.body).toMatchObject({ stopped: 'GUARDRAIL_VIOLATION' });
    expect((part.body as { action_ids: string[] }).action_ids).toHaveLength(1);
    // Hết hẳn hạn mức → lỗi như thường (không có hành động nào).
    const none = await call(ads.POST, {
      ...u,
      body: { adAccountId: s.adAccountId, adsetIds, creativeIds: [s.creativeId], name: 'Lần 3' },
    });
    expect(none.status).toBe(422);
    // Quá 10 cặp → 422 trước khi tạo gì.
    const many = await call(ads.POST, {
      ...u,
      body: {
        adAccountId: s.adAccountId,
        adsetIds: ['1', '2', '3'],
        creativeIds: ['1', '2', '3', '4'],
        name: 'X',
      },
    });
    expect(many.status).toBe(422);
  });
});
