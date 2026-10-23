import { schema, type Db } from '@adxlens/db';
import { seedAdAccount, seedClient, seedConnection, seedMember, seedWorkspace } from '@adxlens/db/testing';

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
    ],
  };
  return world;
}

export type World = Awaited<ReturnType<typeof seedWorld>>;
