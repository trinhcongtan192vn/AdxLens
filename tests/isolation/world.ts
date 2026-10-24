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
  // Creative + ad của B (P103): creative library của A không được thấy.
  await db.insert(schema.entities).values([
    {
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      entityType: 'creative',
      metaId: '999000333',
      name: 'Beta Creative Secret',
      attrs: { thumbnail_url: 'https://img.test/beta-creative-secret.jpg' },
    },
    {
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      entityType: 'ad',
      metaId: '999000111222',
      name: 'Beta Ad Secret',
      attrs: { creative_id: '999000333' },
    },
  ]);
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

  const [bRecommendation] = await db
    .insert(schema.recommendations)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      week: '2026-10-19',
      source: 'finding',
      sourceKey: 'test_rule',
      findingId: bFinding!.id,
      entityType: 'ad',
      metaId: '999000111222',
      entityName: 'Beta Recommendation Secret',
      action: { key: 'x' },
      why: { key: 'y' },
      evidence: {},
      confidence: '0.500',
      effortMinutes: 10,
      score: '1',
    })
    .returning();

  const [bAction] = await db
    .insert(schema.actions)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      actionType: 'pause_ad',
      targetType: 'ad',
      targetMetaId: '999000111222',
      targetName: 'Beta Action Secret',
      tier: 'approve',
      params: {},
      beforeState: { status: 'ACTIVE' },
      afterExpected: { status: 'PAUSED' },
      afterState: { status: 'PAUSED' },
      status: 'success',
      idempotencyKey: `beta-action-${b.workspace.id}`,
    })
    .returning();

  const [bRule] = await db
    .insert(schema.automationRules)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      name: 'Beta Rule Secret',
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '1' }],
      action: { type: 'pause_ad' },
      guardrails: {},
      createdBy: b.owner.id,
    })
    .returning();

  // Cờ P0/P1/P2a/P2b bật cho A (qua core/flags, như PM bật) để probe chạy hết logic route sau cờ.
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
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

  const [bSchedule] = await db
    .insert(schema.reportSchedules)
    .values({
      workspaceId: b.workspace.id,
      clientId: bClient.id,
      cadence: 'weekly',
      weekday: 1,
      sendHour: 9,
      timezone: 'Asia/Ho_Chi_Minh',
      mode: 'approval',
      delivery: 'link',
      recipients: ['beta-secret@client.vn'],
      createdBy: b.owner.id,
    })
    .returning();
  const [bDelivery] = await db
    .insert(schema.reportDeliveries)
    .values({
      workspaceId: b.workspace.id,
      scheduleId: bSchedule!.id,
      period: '2026-W43',
      reportId: bReport!.id,
      status: 'pending_approval',
    })
    .returning();

  // Gói của B (026): workspace A không được thấy hay đổi được.
  await db.insert(schema.subscriptions).values({
    workspaceId: b.workspace.id,
    planKey: 'scale',
    status: 'past_due',
    pastDueSince: new Date('2026-10-20T00:00:00Z'),
    overLimitSince: new Date('2026-10-20T00:00:00Z'),
    provider: 'stripe',
    providerCustomerId: 'cus_beta_secret',
    providerSubscriptionId: 'sub_beta_secret',
  });
  await db.insert(schema.paymentOrders).values({
    workspaceId: b.workspace.id,
    provider: 'payos',
    planKey: 'scale',
    period: 'annual',
    amountVnd: '33504000',
    checkoutUrl: 'https://pay.payos.test/beta-order-secret',
  });
  await db.insert(schema.billingProfiles).values({
    workspaceId: b.workspace.id,
    companyName: 'Beta Billing Secret',
    taxCode: '0399999999',
    invoiceEmail: 'beta-invoice-secret@beta.vn',
  });

  // W1–W5: tài sản Meta, mục tiêu Client, cảnh báo tự đặt của B.
  await db.insert(schema.metaAssets).values({
    workspaceId: b.workspace.id,
    connectionId: bConnection.id,
    kind: 'page',
    metaId: 'page_beta_secret',
    name: 'Beta Page Secret',
  });
  await db.insert(schema.clientGoals).values({
    workspaceId: b.workspace.id,
    clientId: bClient.id,
    primaryMetric: 'cpa',
    primaryTarget: '777777',
    industry: 'finance',
    defaultPageId: 'page_beta_secret',
  });
  const [bAlert] = await db
    .insert(schema.customAlerts)
    .values({
      workspaceId: b.workspace.id,
      adAccountId: bAdAccount.id,
      currency: 'VND',
      metric: 'cpm',
      condition: 'above',
      threshold: '987654',
      createdBy: b.owner.id,
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
      recommendation: bRecommendation!,
      action: bAction!,
      rule: bRule!,
      report: bReport!,
      shareLink: bShare!,
      notification: bNote!,
      schedule: bSchedule!,
      delivery: bDelivery!,
      alert: bAlert!,
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
      'page_beta_secret',
      'Beta Page Secret',
      '987654',
      bAlert!.id,
      bRun!.id,
      'Beta Campaign Secret',
      bFinding!.id,
      'Beta Ad Secret',
      bReport!.id,
      bShare!.id,
      bNote!.id,
      bSchedule!.id,
      bDelivery!.id,
      'beta-secret@client.vn',
      'B'.repeat(43),
      'cus_beta_secret',
      'sub_beta_secret',
      'Beta Billing Secret',
      'Beta Creative Secret',
      'Beta Recommendation Secret',
      'Beta Action Secret',
      'Beta Rule Secret',
      bRule!.id,
      bAction!.id,
      bRecommendation!.id,
      'beta-creative-secret',
      'beta-order-secret',
      'beta-invoice-secret@beta.vn',
    ],
  };
  return world;
}

export type World = Awaited<ReturnType<typeof seedWorld>>;
