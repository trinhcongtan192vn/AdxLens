import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, listAssets, refreshAssets, saveConnection } from '@adxlens/core/connections';
import { addCreativeDraft } from '@adxlens/core/execution';
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  askAgent,
  COPYWRITING_MAX_CALLS,
  getThread,
  runAgentReply,
  toolsFor,
  userNumberFacts,
  type AgentContentBlock,
  type AgentLlm,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 14).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, {
      workspaceId: workspace.id,
      key,
      staffUserId: pm.id,
      reason: 'test ad plan',
      override: true,
    });
  }
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-ap', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'ap' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const id = a!.adAccountId;
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, id, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  const wctx = { db, workspaceId: workspace.id };
  await refreshAssets(wctx, connectionId, 'mock-token', ['act_100000001'], { meta: new MockMetaRead(now), clock });
  const page = (await listAssets(wctx, 'page'))[0]!;
  const [tpl] = await db
    .select({ metaId: schema.entities.metaId, budget: schema.entities.dailyBudget })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, id), eq(schema.entities.entityType, 'adset')))
    .orderBy(schema.entities.metaId)
    .limit(1);
  const draft = await addCreativeDraft(ctx, {
    adAccountId: id,
    source: 'upload',
    storagePath: `${workspace.id}/${id}/a.png`,
    contentType: 'image/png',
  });
  return { ctx, id, page: page.metaId, tpl: tpl!, draft: draft.id };
}

/** LLM giả theo kịch bản (như agent.test.ts). */
function scripted(steps: ((seen: unknown[]) => AgentContentBlock[])[]): AgentLlm & { seen: unknown[] } {
  const seen: unknown[] = [];
  let i = 0;
  return {
    seen,
    async chat({ messages }) {
      seen.push(messages[messages.length - 1]);
      const content = steps[Math.min(i++, steps.length - 1)]!(seen);
      return { content, stopReason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn' };
    },
  };
}
const copywriter = (variants: { headline: string; message: string }[]): AgentLlm & { calls: number } => {
  const w = {
    calls: 0,
    async chat() {
      w.calls++;
      return {
        content: [{ type: 'text' as const, text: '```json\n' + JSON.stringify({ variants }) + '\n```' }],
        stopReason: 'end_turn',
      };
    },
  };
  return w;
};
const toolResult = (seen: unknown[]) => {
  const last = seen[seen.length - 1] as { content: { type: string; content: string; is_error?: boolean }[] };
  return last.content.find((c) => c.type === 'tool_result')!;
};

const ask = (ctx: Parameters<typeof askAgent>[0], q: string, id: string) =>
  askAgent(ctx, { threadId: null, question: q, adAccountId: id }, { enqueue: recordingEnqueue(), clock });

describe('Tạo quảng cáo qua chat (ADR-0030 / 0031)', () => {
  it('số người dùng gõ: hiểu "200k", "2 triệu", "1,5tr"', () => {
    const v = userNumberFacts('Ngân sách 200k/ngày, giảm 30%, tổng 2 triệu, thêm 1,5tr', 'vi').map((f) => f.value);
    expect(v).toEqual(expect.arrayContaining([200, 200000, 30, 2, 2000000, 1.5, 1500000]));
  });

  it('viết nội dung (loại phương án có số lạ) → đề xuất kế hoạch → thẻ kế hoạch, không tạo hành động nào', async () => {
    const s = await setup();
    const budget = String(Math.round(Number(s.tpl.budget)));
    const { threadId, messageId } = await ask(
      s.ctx,
      `Tạo quảng cáo sale giảm 30% cho serum, ngân sách ${budget} mỗi ngày, link https://shop.example.vn/sale`,
      s.id,
    );
    const cw = copywriter([
      { headline: 'Serum giảm 30%', message: 'Chỉ cuối tuần này' },
      { headline: 'Serum giảm 50%', message: 'Số lượng có hạn' },
    ]);
    const steps = (headline: string) => [
      {
        key: 'creative',
        kind: 'create_creative',
        draftId: s.draft,
        pageId: s.page,
        link: 'https://shop.example.vn/sale',
        message: 'Chỉ cuối tuần này',
        headline,
        cta: 'SHOP_NOW',
        name: 'Serum sale · ảnh',
      },
      {
        key: 'adset',
        kind: 'create_adset',
        templateAdsetId: s.tpl.metaId,
        name: 'Serum sale · VN',
        dailyBudget: budget,
        countries: ['VN'],
        ageMin: 25,
        ageMax: 44,
      },
      { key: 'ad', kind: 'create_ad', adset: { ref: 'adset' }, creative: { ref: 'creative' }, name: 'Serum sale' },
    ];
    let copyOut: { variants: unknown[]; rejected_for_unknown_numbers: number } | null = null;
    const llm = scripted([
      () => [{ type: 'tool_use', id: 't1', name: 'write_ad_copy', input: { product: 'serum', offer: 'giảm 30%' } }],
      (seen) => {
        copyOut = JSON.parse(toolResult(seen).content);
        // Model phân tích bịa "70%" → công cụ từ chối, không tạo kế hoạch.
        return [
          {
            type: 'tool_use',
            id: 't2',
            name: 'propose_ad_plan',
            input: { account_id: s.id, title: 'Serum sale', steps: steps('Serum giảm 70%') },
          },
        ];
      },
      (seen) => {
        expect(toolResult(seen)).toMatchObject({ is_error: true });
        expect(toolResult(seen).content).toContain('70');
        return [
          {
            type: 'tool_use',
            id: 't3',
            name: 'propose_ad_plan',
            input: { account_id: s.id, title: 'Serum sale', steps: steps('Serum giảm 30%') },
          },
        ];
      },
      () => [{ type: 'text', text: 'Đã soạn kế hoạch: tiêu đề "Serum giảm 30%". Bạn xem và duyệt thẻ kế hoạch.' }],
    ]);
    expect(await runAgentReply(s.ctx, messageId, { llm, copywriter: cw, clock })).toEqual({ source: 'llm' });
    expect(copyOut).toMatchObject({ variants: [{ headline: 'Serum giảm 30%' }], rejected_for_unknown_numbers: 1 });

    const a = (await getThread(s.ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a.data.plans).toHaveLength(1);
    const plans = await db
      .select()
      .from(schema.actionPlans)
      .where(eq(schema.actionPlans.workspaceId, s.ctx.workspaceId));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: a.data.plans![0],
      status: 'proposed',
      source: 'agent',
      agentMessageId: messageId,
    });
    expect(await db.select().from(schema.actions).where(eq(schema.actions.workspaceId, s.ctx.workspaceId))).toEqual([]);
  });

  it('ngân sách người dùng chưa nói → từ chối; chưa có model viết nội dung → lỗi công cụ; giới hạn số lần viết', async () => {
    const s = await setup();
    const { messageId } = await ask(s.ctx, 'Tạo quảng cáo cho serum', s.id);
    const errors: string[] = [];
    const llm = scripted([
      () => [{ type: 'tool_use', id: 't1', name: 'write_ad_copy', input: { product: 'serum' } }],
      (seen) => {
        errors.push(toolResult(seen).content);
        return [
          {
            type: 'tool_use',
            id: 't2',
            name: 'propose_ad_plan',
            input: {
              account_id: s.id,
              title: 'Serum',
              steps: [
                {
                  key: 'adset',
                  kind: 'create_adset',
                  templateAdsetId: s.tpl.metaId,
                  name: 'Serum',
                  dailyBudget: '987654',
                  countries: ['VN'],
                  ageMin: 18,
                  ageMax: 65,
                },
              ],
            },
          },
        ];
      },
      (seen) => {
        errors.push(toolResult(seen).content);
        return [{ type: 'text', text: 'Bạn cho mình biết ngân sách mỗi ngày nhé.' }];
      },
    ]);
    await runAgentReply(s.ctx, messageId, { llm, copywriter: null, clock });
    expect(errors[0]).toContain('model viết nội dung');
    expect(errors[1]).toContain('987654');
    expect(await db.select().from(schema.actionPlans)).toEqual([]);

    // Giới hạn số lần gọi model viết nội dung trong một câu trả lời.
    const { messageId: m2 } = await ask(s.ctx, 'Viết thêm nội dung', s.id);
    const cw = copywriter([{ headline: 'Serum', message: 'Dịu nhẹ' }]);
    const many = scripted([
      () =>
        Array.from({ length: COPYWRITING_MAX_CALLS + 1 }, (_, i) => ({
          type: 'tool_use' as const,
          id: `c${i}`,
          name: 'write_ad_copy',
          input: { product: 'serum' },
        })),
      () => [{ type: 'text', text: 'Xong.' }],
    ]);
    await runAgentReply(s.ctx, m2, { llm: many, copywriter: cw, clock });
    expect(cw.calls).toBe(COPYWRITING_MAX_CALLS);

    expect(toolsFor({ p2a_approve: false }).map((t) => t.name)).not.toEqual(expect.arrayContaining(['write_ad_copy']));
    expect(toolsFor({ p2a_approve: false }).map((t) => t.name)).not.toContain('propose_ad_plan');
  });
});
