import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import { latestEntityChanges } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function setup(name: string) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const conn = await seedConnection(db, workspace.id, owner.id, `lc-${name}`);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { metaAccountId: `act_7${name.length}001`, name });
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const ent = (entityType: 'campaign' | 'adset' | 'ad', metaId: string, parentMetaId: string | null, attrs = {}) => ({
    workspaceId: workspace.id,
    adAccountId: acc.id,
    entityType,
    metaId,
    parentMetaId,
    name: `${entityType}-${metaId}`,
    attrs,
  });
  await db
    .insert(schema.entities)
    .values([
      ent('campaign', '100', null),
      ent('adset', '200', '100'),
      ent('ad', '300', '200', { campaign_id: '100' }),
      ent('ad', '301', '200', { campaign_id: '100' }),
    ]);
  return { ctx, acc, workspaceId: workspace.id };
}

async function act(ws: string, acc: string, type: string, target: string, minutesAgo: number, status = 'success') {
  await db.insert(schema.actions).values({
    workspaceId: ws,
    adAccountId: acc,
    actionType: type,
    targetType: type.endsWith('_ad') ? 'ad' : 'adset',
    targetMetaId: target,
    targetName: `t-${target}`,
    tier: 'approve',
    params: {},
    beforeState: {},
    afterExpected: {},
    status: status as never,
    idempotencyKey: randomUUID(),
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
  });
}

describe('cột "Thay đổi gần nhất" (Ads Manager 2.0)', () => {
  it('ad / nhóm QC / chiến dịch lấy hành động gần nhất của chính nó hoặc con; bỏ hành động đã hủy', async () => {
    const { ctx, acc, workspaceId } = await setup('A');
    await act(workspaceId, acc.id, 'pause_ad', '300', 60);
    await act(workspaceId, acc.id, 'set_adset_budget', '200', 30);
    await act(workspaceId, acc.id, 'resume_ad', '301', 10);
    await act(workspaceId, acc.id, 'pause_ad', '301', 1, 'canceled');
    const ads = await latestEntityChanges(ctx, [acc.id], 'ad');
    expect(ads.get(`${acc.id}:300`)?.actionType).toBe('pause_ad');
    expect(ads.get(`${acc.id}:301`)?.actionType).toBe('resume_ad');
    const sets = await latestEntityChanges(ctx, [acc.id], 'adset');
    expect(sets.get(`${acc.id}:200`)?.actionType).toBe('resume_ad');
    const camps = await latestEntityChanges(ctx, [acc.id], 'campaign');
    expect(camps.get(`${acc.id}:100`)).toMatchObject({ actionType: 'resume_ad', targetName: 't-301' });
  });

  it('cách ly workspace', async () => {
    const a = await setup('A');
    const b = await setup('BB');
    await act(a.workspaceId, a.acc.id, 'pause_ad', '300', 5);
    expect((await latestEntityChanges(b.ctx, [a.acc.id], 'ad')).size).toBe(0);
  });
});
