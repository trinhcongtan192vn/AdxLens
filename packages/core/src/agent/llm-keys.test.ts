import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { keysFromEnv } from '@adxlens/core/connections';
import { resolveActor } from '@adxlens/core/tenancy';
import { deleteLlmKey, getLlmKey, openaiAgentClient, saveLlmKey, toOpenAiMessages, workspaceAgentLlm } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 5).toString('base64') });
const ANT = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAwxyz';
const OAI = 'sk-proj-BBBBBBBBBBBBBBBBBBBBBBBBlmno';

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  return { ctx, workspaceId: workspace.id };
}

/** fetch giả: ghi lại request, trả phản hồi đã soạn. */
function fakeFetch(res: { status: number; body: unknown }) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(res.body), { status: res.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const input = { system: 'S', messages: [{ role: 'user' as const, content: 'Hỏi' }], tools: [], maxTokens: 100 };

describe('Khóa AI tự mang (ADR-0022)', () => {
  it('chỉ Owner / Manager; sai dạng khóa bị chặn; không bao giờ trả / lưu khóa rõ', async () => {
    const { ctx, workspaceId } = await setup();
    const buyer = await seedMember(db, workspaceId, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    await expect(
      saveLlmKey(bctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(getLlmKey(bctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Khóa OpenAI dán vào ô Anthropic và ngược lại.
    await expect(
      saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: OAI }, KEYS),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: ANT }, KEYS)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(saveLlmKey(ctx, { provider: 'openai', model: 'bad model!', apiKey: OAI }, KEYS)).rejects.toMatchObject(
      {
        code: 'VALIDATION_FAILED',
      },
    );
    // Chưa có khóa thì không lưu được khi bỏ trống khóa.
    await expect(saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5' }, KEYS)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    const info = await saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS);
    expect(info).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', keyHint: 'wxyz', lastError: null });
    expect(JSON.stringify(info)).not.toContain(ANT);
    const [row] = await db.select().from(schema.llmKeys).where(eq(schema.llmKeys.workspaceId, workspaceId));
    expect(row!.keyCiphertext.toString('utf8')).not.toContain('AAAAAAAAAAAA');
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.workspaceId, workspaceId));
    expect(audit.map((a) => a.event)).toContain('llm_key.saved');
    expect(JSON.stringify(audit)).not.toContain(ANT);

    // Đổi model, giữ khóa; đổi nhà cung cấp phải nhập khóa mới.
    expect(await saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-opus-5-5' }, KEYS)).toMatchObject({
      model: 'claude-opus-5-5',
      keyHint: 'wxyz',
    });
    await expect(saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5' }, KEYS)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS)).toMatchObject({
      provider: 'openai',
      keyHint: 'lmno',
    });

    await deleteLlmKey(ctx);
    expect(await getLlmKey(ctx)).toBeNull();
    await expect(deleteLlmKey(ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('worker dựng client theo khóa của đúng workspace; ghi lần dùng / mã lỗi', async () => {
    const a = await setup('A');
    const b = await setup('B');
    await saveLlmKey(a.ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    expect(await workspaceAgentLlm({ db, workspaceId: b.workspaceId }, KEYS.keys)).toBeNull();

    const ok = fakeFetch({
      status: 200,
      body: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [{ id: 'c1', function: { name: 'account_kpis', arguments: '{"period":"last7"}' } }],
            },
          },
        ],
      },
    });
    const own = (await workspaceAgentLlm({ db, workspaceId: a.workspaceId }, KEYS.keys, { fetchImpl: ok.f }))!;
    expect(own).toMatchObject({ provider: 'openai', model: 'gpt-5' });
    const r = await own.llm.chat(input);
    expect(r).toEqual({
      content: [{ type: 'tool_use', id: 'c1', name: 'account_kpis', input: { period: 'last7' } }],
      stopReason: 'tool_use',
    });
    expect(ok.calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(ok.calls[0]!.headers.authorization).toBe(`Bearer ${OAI}`);
    expect(ok.calls[0]!.body).toMatchObject({ model: 'gpt-5', max_completion_tokens: 100 });
    expect((await getLlmKey(a.ctx))!.lastUsedAt).not.toBeNull();

    const bad = fakeFetch({ status: 401, body: { error: { message: `Incorrect API key ${OAI}` } } });
    const own2 = (await workspaceAgentLlm({ db, workspaceId: a.workspaceId }, KEYS.keys, { fetchImpl: bad.f }))!;
    const e = (await own2.llm.chat(input).catch((x: unknown) => x)) as Error;
    // Thông điệp lỗi chỉ có mã HTTP, không có khóa hay nội dung từ nhà cung cấp.
    expect(e.message).toBe('LLM_HTTP_401');
    expect((await getLlmKey(a.ctx))!.lastError).toBe('LLM_HTTP_401');
  });

  it('chuyển hội thoại khối sang Chat Completions (tool_use → tool_calls, tool_result → role tool)', () => {
    expect(
      toOpenAiMessages('SYS', [
        { role: 'user', content: 'Hỏi' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Xem' },
            { type: 'tool_use', id: 't1', name: 'account_kpis', input: { period: 'last7' } },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"a":1}' }] },
      ]),
    ).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'Hỏi' },
      {
        role: 'assistant',
        content: 'Xem',
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'account_kpis', arguments: '{"period":"last7"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 't1', content: '{"a":1}' },
    ]);
  });

  it('OpenAI trả văn bản → khối text; tham số công cụ hỏng → input rỗng', async () => {
    const { f } = fakeFetch({
      status: 200,
      body: {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'Xong', tool_calls: [{ id: 'x', function: { name: 'n', arguments: '{oops' } }] },
          },
        ],
      },
    });
    const r = await openaiAgentClient({ apiKey: OAI, model: 'gpt-5', fetchImpl: f }).chat(input);
    expect(r).toEqual({
      content: [
        { type: 'text', text: 'Xong' },
        { type: 'tool_use', id: 'x', name: 'n', input: {} },
      ],
      stopReason: 'end_turn',
    });
  });
});
