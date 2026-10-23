import { schema, type Db } from '@adxlens/db';
import { enableFlag } from '@adxlens/core/flags';
import { seedAdAccount, seedClient, seedConnection, seedMember, seedStaff, seedWorkspace } from '@adxlens/db/testing';

/**
 * Hai workspace A và B với dữ liệu nghiệp vụ. Feature mới thêm bảng thì thêm dữ liệu của B vào đây
 * và đưa định danh/tên vào `bFingerprints` để mọi probe tự kiểm tra không rò sang A.
 */
export async function seedWorld(db: Db) {
  const a = await seedWorkspace(db, 'Agency Alpha');
  const b = await seedWorkspace(db, 'Agency Beta Secret');
  const aClient = await seedClient(db, a.workspace.id, 'Alpha Client');
  const bClient = await seedClient(db, b.workspace.id, 'Beta Client Secret');
  const aManager = await seedMember(db, a.workspace.id, 'manager');
  const bManager = await seedMember(db, b.workspace.id, 'manager');
  const aConnection = await seedConnection(db, a.workspace.id, a.owner.id, 'meta-alpha');
  const bConnection = await seedConnection(db, b.workspace.id, b.owner.id, 'meta-beta-secret');
  const aAdAccount = await seedAdAccount(db, a.workspace.id, aConnection.id, {
    metaAccountId: 'act_111111',
    name: 'Alpha Ads',
    clientId: aClient.id,
    confirmed: true,
  });
  const bAdAccount = await seedAdAccount(db, b.workspace.id, bConnection.id, {
    metaAccountId: 'act_999999',
    name: 'Beta Ads Secret',
    clientId: bClient.id,
    confirmed: true,
  });

  // Dữ liệu đồng bộ của B (012): lần chạy, cấu trúc, insight — job/route của A không được chạm.
  const [bRun] = await db
    .insert(schema.syncRuns)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      kind: 'backfill',
      dateFrom: '2026-07-25',
      dateTo: '2026-10-22',
      status: 'running',
      batchesTotal: 13,
      daysTotal: 90,
    })
    .returning();
  await db.insert(schema.entities).values({
    workspaceId: b.workspace.id,
    adAccountId: bAdAccount.id,
    entityType: 'campaign',
    metaId: '999000111',
    name: 'Beta Campaign Secret',
  });
  await db.insert(schema.insightsDaily).values({
    workspaceId: b.workspace.id,
    adAccountId: bAdAccount.id,
    entityType: 'ad',
    metaId: '999000111222',
    date: '2026-10-20',
    spend: '123456.0000',
    attributionWindow: '7d_click_1d_view',
  });

  await db.insert(schema.reconciliationResults).values({
    workspaceId: b.workspace.id,
    adAccountId: bAdAccount.id,
    date: '2026-10-20',
    spendInternal: '123456.0000',
    spendMeta: '123456.0000',
    resultsInternal: 3,
    resultsMeta: 3,
    spendDeltaPct: '0',
    resultsDeltaPct: '0',
    status: 'ok',
  });

  const [bFinding] = await db
    .insert(schema.findings)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      ruleId: 'test_rule',
      ruleGroup: 'test',
      entityType: 'ad',
      metaId: '999000111222',
      entityName: 'Beta Ad Secret',
      severity: 'high',
      evidence: {},
      explanation: { why: { key: 'x' }, whatToDo: { key: 'y' }, deepLink: null },
      snapshotVersion: 'v1',
    })
    .returning();

  // Cờ P0 bật cho A (qua core/flags, như PM bật) để probe chạy hết logic route sau cờ.
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports'] as const) {
    await enableFlag(db, {
      workspaceId: a.workspace.id,
      key,
      staffUserId: pm.id,
      reason: 'probe cách ly',
      override: true,
    });
  }
  const [bReport] = await db
    .insert(schema.reports)
    .values({
      workspaceId: b.workspace.id,
      clientId: bClient.id,
      kind: 'periodic',
      dateFrom: '2026-10-16',
      dateTo: '2026-10-22',
      locale: 'vi',
      status: 'ready',
      content: { client: { name: 'Beta Client Secret' } },
      templateVersion: 'v1',
      createdBy: b.owner.id,
    })
    .returning();

  const [bShare] = await db
    .insert(schema.shareLinks)
    .values({ workspaceId: b.workspace.id, reportId: bReport!.id, token: 'B'.repeat(43), createdBy: b.owner.id })
    .returning();

  const [bNote] = await db
    .insert(schema.notifications)
    .values({
      workspaceId: b.workspace.id,
      userId: b.owner.id,
      kind: 'sync_done',
      params: { account: 'Beta Ads Secret' },
    })
    .returning();

  const world = {
    a: {
      workspace: a.workspace,
      owner: a.owner,
      manager: aManager,
      client: aClient,
      connection: aConnection,
      adAccount: aAdAccount,
    },
    b: {
      workspace: b.workspace,
      owner: b.owner,
      manager: bManager,
      client: bClient,
      connection: bConnection,
      adAccount: bAdAccount,
      syncRun: bRun!,
      finding: bFinding!,
      report: bReport!,
      shareLink: bShare!,
      notification: bNote!,
    },
    /** Chuỗi của B tuyệt đối không được xuất hiện trong phản hồi cho ngữ cảnh A. */
    bFingerprints: [
      b.workspace.id,
      b.workspace.name,
      b.owner.id,
      b.owner.email,
      bManager.id,
      bManager.email,
      bClient.id,
      bClient.name,
      bConnection.id,
      'meta-beta-secret',
      bAdAccount.id,
      bAdAccount.name,
      'act_999999',
      bRun!.id,
      'Beta Campaign Secret',
      bFinding!.id,
      'Beta Ad Secret',
      bReport!.id,
      bShare!.id,
      bNote!.id,
      'B'.repeat(43),
    ],
  };
  return world;
}

export type World = Awaited<ReturnType<typeof seedWorld>>;
