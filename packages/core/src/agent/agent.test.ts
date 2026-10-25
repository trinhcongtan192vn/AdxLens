import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  AGENT_DAILY_LIMIT,
  askAgent,
  factsFrom,
  getThread,
  listThreads,
  runAgentReply,
  runTool,
  stopAgentReply,
  toolsFor,
  type AgentContentBlock,
  type AgentLlm,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };

async function setup(name = 'A', flags: ('p1_recommendations' | 'p2a_approve')[] = ['p1_recommendations']) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', ...flags] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test agent', override: true });
  }
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-ag',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `ag${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  for (const c of enqueue.calls.slice(0, 2)) {
    await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  }
  return { ctx, id: a!.adAccountId, workspaceId: workspace.id };
}

/** LLM giả: lần lượt trả các phản hồi đã soạn; ghi lại công cụ được cung cấp và tin nhắn nhận được. */
function scripted(
  steps: ((seen: unknown[]) => AgentContentBlock[])[],
): AgentLlm & { tools: string[][]; seen: unknown[] } {
  const tools: string[][] = [];
  const seen: unknown[] = [];
  let i = 0;
  return {
    tools,
    seen,
    async chat({ messages, tools: spec }) {
      tools.push(spec.map((s) => s.name));
      seen.push(messages[messages.length - 1]);
      const step = steps[Math.min(i, steps.length - 1)]!;
      i++;
      const content = step(seen);
      return { content, stopReason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn' };
    },
  };
}

const lastToolJson = (seen: unknown[]) => {
  const last = seen[seen.length - 1] as { content: { type: string; content: string }[] };
  return JSON.parse(last.content[0]!.content) as Record<string, unknown>;
};

async function ask(ctx: Parameters<typeof askAgent>[0], q: string, adAccountId?: string) {
  const enqueue = recordingEnqueue();
  const r = await askAgent(ctx, { threadId: null, question: q, adAccountId }, { enqueue, clock });
  expect(enqueue.calls[0]).toMatchObject({ name: 'recommend:agent_reply', payload: { messageId: r.messageId } });
  return r;
}

describe('AI agent (ADR-0019)', () => {
  it('cờ P1 tắt → không hỏi được, không đọc được hội thoại', async () => {
    const { ctx } = await setup('off', []);
    await expect(
      askAgent(ctx, { threadId: null, question: 'hi' }, { enqueue: recordingEnqueue() }),
    ).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(listThreads(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('gọi công cụ đọc → trả lời dùng đúng số công cụ → lưu, ghi công cụ đã dùng', async () => {
    const { ctx, id } = await setup();
    const { threadId, messageId } = await ask(ctx, 'Chi tiêu 7 ngày qua?', id);
    let spend = '';
    const llm = scripted([
      () => [{ type: 'tool_use', id: 't1', name: 'account_kpis', input: { period: 'last7' } }],
      (seen) => {
        const r = lastToolJson(seen) as { metrics: { spend: { current: string; change_pct: number } } };
        spend = r.metrics.spend.current;
        return [
          {
            type: 'text',
            text: `Chi tiêu 7 ngày qua là ${Number(spend)} đ, thay đổi ${Math.abs(r.metrics.spend.change_pct)}%.`,
          },
        ];
      },
    ]);
    expect(await runAgentReply(ctx, messageId, { llm, clock })).toEqual({ source: 'llm' });
    const t = await getThread(ctx, threadId);
    const a = t.messages.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ status: 'done', data: { source: 'llm', tools: [{ name: 'account_kpis' }] } });
    expect(a.content).toContain(String(Number(spend)));
    // Công cụ ghi không được cung cấp khi cờ P2a tắt.
    expect(llm.tools[0]).not.toContain('propose_action');
  });

  it('LLM bịa số → sinh lại, vẫn sai → trả bảng số từ công cụ (không văn bản LLM)', async () => {
    const { ctx, id } = await setup();
    const { threadId, messageId } = await ask(ctx, 'CPA?', id);
    const llm = scripted([
      () => [{ type: 'tool_use', id: 't1', name: 'account_kpis', input: {} }],
      () => [{ type: 'text', text: 'CPA là 123456789 đ.' }],
    ]);
    expect(await runAgentReply(ctx, messageId, { llm, clock })).toEqual({ source: 'facts' });
    const a = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a.content).toBe('');
    expect(a.data.source).toBe('facts');
    expect(a.data.facts!.length).toBeGreaterThan(0);
    expect(a.data.rejected!.flat()).toContain(123456789);
  });

  it('propose_action chỉ khi cờ P2a bật; chỉ tạo thẻ đề xuất, không ghi hành động nào', async () => {
    const { ctx, id } = await setup('p2', ['p1_recommendations', 'p2a_approve']);
    const [ad] = await db.execute<{ meta_id: string }>(
      sql`select meta_id from analytics.entities where ad_account_id = ${id} and entity_type = 'ad' limit 1`,
    );
    const { threadId, messageId } = await ask(ctx, 'Tạm dừng quảng cáo kém nhất', id);
    const llm = scripted([
      () => [
        {
          type: 'tool_use',
          id: 't1',
          name: 'propose_action',
          input: { action_type: 'pause_ad', account_id: id, target_meta_id: ad!.meta_id, reason: 'CPA cao' },
        },
      ],
      () => [{ type: 'text', text: 'Đã tạo đề xuất tạm dừng, bạn xem trước và duyệt.' }],
    ]);
    await runAgentReply(ctx, messageId, { llm, clock });
    expect(llm.tools[0]).toContain('propose_action');
    const a = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a.data.proposals).toEqual([
      expect.objectContaining({ actionType: 'pause_ad', adAccountId: id, targetMetaId: ad!.meta_id }),
    ]);
    const [n] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.actions where workspace_id = ${ctx.workspaceId}`,
    );
    expect(n!.n).toBe(0);
    expect(toolsFor({ p2a_approve: false }).map((t) => t.name)).not.toContain('propose_action');
  });

  it('dữ liệu không phải lệnh: tên từ Meta được bọc «»; công cụ với tài khoản workspace khác → lỗi công cụ', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const { messageId } = await ask(a.ctx, 'tài khoản nào?');
    const llm = scripted([
      () => [
        { type: 'tool_use', id: 't1', name: 'list_accounts', input: {} },
        { type: 'tool_use', id: 't2', name: 'account_kpis', input: { account_id: b.id } },
      ],
      () => [{ type: 'text', text: 'Bạn có 1 tài khoản.' }],
    ]);
    await runAgentReply(a.ctx, messageId, { llm, clock });
    const results = (llm.seen[1] as { content: { content: string; is_error?: boolean }[] }).content;
    expect(results[0]!.content).toMatch(/«.+»/);
    expect(results[1]!.is_error).toBe(true);
    expect(results[1]!.content).not.toContain(b.workspaceId);
  });

  it('giới hạn câu hỏi / ngày; người khác (cùng hoặc khác workspace) không đọc được hội thoại', async () => {
    const { ctx, workspaceId } = await setup();
    const { threadId } = await ask(ctx, 'q1');
    for (let i = 1; i < AGENT_DAILY_LIMIT; i++) {
      await askAgent(ctx, { threadId, question: `q${i + 1}` }, { enqueue: recordingEnqueue(), clock });
    }
    await expect(
      askAgent(ctx, { threadId, question: 'quá' }, { enqueue: recordingEnqueue(), clock }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    const other = await seedMember(db, workspaceId, 'manager');
    const octx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, other.id))! };
    await expect(getThread(octx, threadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const b = await setup('B');
    await expect(getThread(b.ctx, threadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('không có key → tin trả lời "chưa cấu hình", không lỗi', async () => {
    const { ctx } = await setup();
    const { threadId, messageId } = await ask(ctx, 'xin chào');
    expect(await runAgentReply(ctx, messageId, { llm: null, clock })).toEqual({ source: 'unconfigured' });
    const a = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ status: 'done', data: { source: 'unconfigured' } });
  });

  it('ghi khóa nào trả lời (ADR-0022); LLM lỗi → bảng số kèm mã lỗi, không có thông điệp nhà cung cấp', async () => {
    const { ctx } = await setup();
    const llmInfo = { via: 'workspace' as const, provider: 'openai', model: 'gpt-5' };
    const q1 = await ask(ctx, 'xin chào');
    await runAgentReply(ctx, q1.messageId, {
      llm: scripted([() => [{ type: 'text', text: 'Chào bạn' }]]),
      llmInfo,
      clock,
    });
    const a1 = (await getThread(ctx, q1.threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a1.data).toMatchObject({ source: 'llm', llm: llmInfo });

    const q2 = await ask(ctx, 'xin chào lần nữa');
    const failing: AgentLlm = {
      chat: () => Promise.reject(new Error('LLM_HTTP_429')),
    };
    expect(await runAgentReply(ctx, q2.messageId, { llm: failing, llmInfo, clock })).toEqual({ source: 'facts' });
    const a2 = (await getThread(ctx, q2.threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a2.data).toMatchObject({ source: 'facts', llm: llmInfo, llmError: 'LLM_HTTP_429' });

    const q3 = await ask(ctx, 'câu ba');
    const leaky: AgentLlm = { chat: () => Promise.reject(new Error('invalid x-api-key sk-ant-secret')) };
    await runAgentReply(ctx, q3.messageId, { llm: leaky, clock });
    const a3 = (await getThread(ctx, q3.threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a3.data.llmError).toBe('LLM_ERROR');
    expect(JSON.stringify(a3)).not.toContain('sk-ant-secret');
  });

  it('trả lời theo ngôn ngữ người hỏi', async () => {
    const { ctx } = await setup();
    const enqueue = recordingEnqueue();
    const { messageId } = await askAgent(ctx, { threadId: null, question: 'hello', locale: 'en' }, { enqueue, clock });
    let system = '';
    const llm: AgentLlm = {
      async chat(i) {
        system = i.system;
        return { content: [{ type: 'text', text: 'Hi.' }], stopReason: 'end_turn' };
      },
    };
    await runAgentReply(ctx, messageId, { llm, clock });
    expect(system).toContain('Answer in English');
  });

  it('công cụ giai đoạn phễu / trang đích trả số đã tính', async () => {
    const { ctx, id } = await setup();
    const t = { ctx, defaultAccountId: id, now: now() };
    const st = (await runTool('funnel_stages', { period: 'last7' }, t, { p2a_approve: false })).data as {
      stages: { stage: string }[];
    };
    expect(st.stages.map((s) => s.stage)).toEqual(expect.arrayContaining(['prospecting', 'retargeting']));
    const lp = (await runTool('landing_pages', {}, t, { p2a_approve: false })).data as { pages: { page: string }[] };
    expect(lp.pages[0]!.page).toMatch(/^«shop\.example\.vn\//);
  });

  it('ngữ cảnh chọn từ bảng: prompt có cấp + id (không có tên); entity_details chỉ trả đối tượng được xem', async () => {
    const { ctx, id } = await setup();
    const [adset] = await ctx.db.execute<{ meta_id: string }>(
      sql`select meta_id from analytics.entities where workspace_id = ${ctx.workspaceId} and entity_type = 'adset' limit 1`,
    );
    const enqueue = recordingEnqueue();
    const { threadId, messageId } = await askAgent(
      ctx,
      {
        threadId: null,
        question: 'Nhóm này sao rồi?',
        adAccountId: id,
        entities: [
          { level: 'adset', metaId: adset!.meta_id },
          { level: 'adset', metaId: 'abc' },
        ],
      },
      { enqueue, clock },
    );
    const systems: string[] = [];
    const llm: AgentLlm = {
      async chat({ system }) {
        systems.push(system);
        return { content: [{ type: 'text', text: 'Đã xem.' }], stopReason: 'end_turn' };
      },
    };
    await runAgentReply(ctx, messageId, { llm, clock });
    expect(systems[0]).toContain(`adset:${adset!.meta_id}`);
    expect(systems[0]).not.toContain('abc');
    const u = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'user')!;
    expect(u.data.context?.entities).toEqual([{ level: 'adset', metaId: adset!.meta_id }]);

    const t = { ctx, defaultAccountId: id, now: now() };
    const r = (
      await runTool('entity_details', { level: 'adset', ids: [adset!.meta_id, '999999999'] }, t, { p2a_approve: false })
    ).data as { entities: { meta_id: string; name: string; metrics: { spend: { current: string | null } } }[] };
    expect(r.entities.map((e) => e.meta_id)).toEqual([adset!.meta_id]);
    expect(r.entities[0]!.name).toMatch(/^«.*»$/);
    expect(r.entities[0]!.metrics.spend.current).not.toBeNull();
  });

  it('nút Dừng: tin đang chờ → "stopped", worker không ghi đè; người khác không dừng được', async () => {
    const { ctx } = await setup();
    const { threadId, messageId } = await ask(ctx, 'xin chào');
    const other = await seedMember(db, ctx.workspaceId, 'manager');
    const octx = { ...ctx, actor: (await resolveActor(db, ctx.workspaceId, other.id))! };
    await expect(stopAgentReply(octx, threadId, messageId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await stopAgentReply(ctx, threadId, messageId);
    const llm = scripted([() => [{ type: 'text', text: 'Muộn rồi' }]]);
    expect(await runAgentReply(ctx, messageId, { llm, clock })).toEqual({ source: 'skip' });
    const a = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({ status: 'done', content: '', data: { source: 'stopped' } });
  });

  it('dừng giữa chừng: worker kiểm trước mỗi vòng, bỏ kết quả', async () => {
    const { ctx } = await setup();
    const { threadId, messageId } = await ask(ctx, 'xin chào');
    const llm: AgentLlm = {
      async chat() {
        await stopAgentReply(ctx, threadId, messageId);
        return { content: [{ type: 'tool_use', id: 't1', name: 'list_accounts', input: {} }], stopReason: 'tool_use' };
      },
    };
    expect(await runAgentReply(ctx, messageId, { llm, clock })).toEqual({ source: 'stopped' });
    const a = (await getThread(ctx, threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a.data.source).toBe('stopped');
  });

  it('tập số được phép: mọi số trong kết quả công cụ + số đếm nhỏ', () => {
    const f = factsFrom([{ a: '150000.0000', b: [12.5, { c: 3 }], name: 'x 99' }]);
    const values = f.map((x) => x.value);
    expect(values).toEqual(expect.arrayContaining([150000, 12.5, 3, 0, 10]));
    expect(values).not.toContain(99);
  });
});
