import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { keysFromEnv } from '@adxlens/core/connections';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  AI_IMAGE_DAILY_LIMIT,
  canGenerateImages,
  deleteLlmKey,
  deleteLlmRoute,
  getLlmKey,
  listLlmKeys,
  listLlmRoutes,
  requestAiImage,
  routedAgentLlm,
  saveLlmKey,
  saveLlmRoute,
  workspaceAgentLlm,
  workspaceImageGenerator,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 9).toString('base64') });
const ANT = 'sk-ant-api03-RRRRRRRRRRRRRRRRRRRRRRRRant1';
const OAI = 'sk-proj-SSSSSSSSSSSSSSSSSSSSSSSSoai1';

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  return { ctx, wctx: { db, workspaceId: workspace.id }, owner };
}

/** fetch giả: ghi URL + body, trả văn bản theo định dạng của nhà cung cấp. */
function fakeFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
    const body = url.includes('anthropic')
      ? { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      : { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const input = { system: 'S', messages: [{ role: 'user' as const, content: 'Hỏi' }], tools: [], maxTokens: 50 };

describe('AI router (ADR-0030)', () => {
  it('nhiều khóa cùng lúc; mặc định: phân tích = khóa mới nhất, viết nội dung theo phân tích, ảnh = OpenAI', async () => {
    const { ctx, wctx } = await setup();
    expect(await listLlmRoutes(ctx)).toEqual({});
    expect(await canGenerateImages(wctx)).toBe(false);

    await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    await saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS);
    // Lưu khóa Anthropic không xóa khóa OpenAI (trước ADR-0030 là thay thế).
    expect((await listLlmKeys(ctx)).map((k) => k.provider)).toEqual(['anthropic', 'openai']);
    expect(await listLlmRoutes(ctx)).toEqual({
      analysis: { task: 'analysis', provider: 'anthropic', model: 'claude-sonnet-5-5', source: 'default' },
      copywriting: { task: 'copywriting', provider: 'anthropic', model: 'claude-sonnet-5-5', source: 'default' },
      image: { task: 'image', provider: 'openai', model: 'gpt-image-1', source: 'default' },
    });
    expect(await getLlmKey(ctx)).toMatchObject({ provider: 'anthropic' });
    expect(await canGenerateImages(wctx)).toBe(true);
    // Chỉ đổi model của khóa OpenAI, khóa Anthropic giữ nguyên.
    await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5-mini' }, KEYS);
    expect((await listLlmKeys(ctx)).find((k) => k.provider === 'anthropic')).toMatchObject({ keyHint: 'ant1' });
  });

  it('chọn model theo việc: kiểm nhà cung cấp, khóa, model ảnh; worker gọi đúng nhà cung cấp; nhật ký', async () => {
    const { ctx, wctx } = await setup();
    const buyer = await seedMember(db, ctx.workspaceId, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, ctx.workspaceId, buyer.id))! };
    await saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS);

    await expect(
      saveLlmRoute(bctx, { task: 'copywriting', provider: 'anthropic', model: 'claude-haiku-5-5' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listLlmRoutes(bctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Anthropic không tạo ảnh; OpenAI chưa có khóa; model ảnh ngoài danh sách.
    await expect(
      saveLlmRoute(ctx, { task: 'image', provider: 'anthropic', model: 'claude-sonnet-5-5' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(saveLlmRoute(ctx, { task: 'copywriting', provider: 'openai', model: 'gpt-5' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    await expect(saveLlmRoute(ctx, { task: 'image', provider: 'openai', model: 'dall-e-9' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    await saveLlmRoute(ctx, { task: 'analysis', provider: 'anthropic', model: 'claude-opus-5-5' });
    await saveLlmRoute(ctx, { task: 'copywriting', provider: 'openai', model: 'gpt-5-mini' });
    const r = await listLlmRoutes(ctx);
    expect(r.analysis).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', source: 'route' });
    expect(r.copywriting).toMatchObject({ provider: 'openai', model: 'gpt-5-mini', source: 'route' });

    const net = fakeFetch();
    const a = (await workspaceAgentLlm(wctx, KEYS.keys, { fetchImpl: net.f }))!;
    const c = (await routedAgentLlm(wctx, KEYS.keys, 'copywriting', { fetchImpl: net.f }))!;
    expect([a.provider, a.model, c.provider, c.model]).toEqual([
      'anthropic',
      'claude-opus-5-5',
      'openai',
      'gpt-5-mini',
    ]);
    await a.llm.chat(input);
    await c.llm.chat(input);
    expect(net.calls.map((x) => [x.url, x.body.model])).toEqual([
      ['https://api.anthropic.com/v1/messages', 'claude-opus-5-5'],
      ['https://api.openai.com/v1/chat/completions', 'gpt-5-mini'],
    ]);
    // Lần dùng ghi lên đúng khóa của từng nhà cung cấp.
    expect((await listLlmKeys(ctx)).every((k) => k.lastUsedAt !== null)).toBe(true);

    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.workspaceId, ctx.workspaceId));
    expect(audit.filter((x) => x.event === 'llm_route.saved')).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(OAI);

    await deleteLlmRoute(ctx, 'copywriting');
    expect((await listLlmRoutes(ctx)).copywriting).toMatchObject({ provider: 'anthropic', source: 'default' });
    await expect(deleteLlmRoute(ctx, 'copywriting')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('xóa khóa một nhà cung cấp: route trỏ tới nó bị xóa, ảnh tắt; workspace khác không thấy gì', async () => {
    const { ctx, wctx } = await setup('A');
    const b = await setup('B');
    await saveLlmKey(ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS);
    await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    await saveLlmRoute(ctx, { task: 'copywriting', provider: 'openai', model: 'gpt-5' });
    expect(await listLlmRoutes(b.ctx)).toEqual({});
    expect(await routedAgentLlm(b.wctx, KEYS.keys, 'copywriting')).toBeNull();
    expect(await workspaceImageGenerator(b.wctx, KEYS.keys)).toBeNull();

    await deleteLlmKey(ctx, 'openai');
    expect((await listLlmKeys(ctx)).map((k) => k.provider)).toEqual(['anthropic']);
    expect(await db.select().from(schema.llmRoutes).where(eq(schema.llmRoutes.workspaceId, ctx.workspaceId))).toEqual(
      [],
    );
    expect(await canGenerateImages(wctx)).toBe(false);
    expect(await workspaceImageGenerator(wctx, KEYS.keys)).toBeNull();
    expect((await listLlmRoutes(ctx)).copywriting).toMatchObject({ provider: 'anthropic' });
    await expect(deleteLlmKey(ctx, 'openai')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it(`ảnh AI: tối đa ${AI_IMAGE_DAILY_LIMIT} ảnh / workspace / 24 giờ`, async () => {
    const { ctx, owner } = await setup();
    const conn = await seedConnection(db, ctx.workspaceId, owner.id);
    const acc = await seedAdAccount(db, ctx.workspaceId, conn.id);
    await saveLlmKey(ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    // Ảnh đã xong (không còn "đang tạo") nhưng vẫn tính vào hạn mức ngày.
    await db.insert(schema.creativeDrafts).values(
      Array.from({ length: AI_IMAGE_DAILY_LIMIT }, () => ({
        workspaceId: ctx.workspaceId,
        adAccountId: acc.id,
        source: 'ai' as const,
        status: 'ready' as const,
        prompt: 'ảnh cũ',
        createdBy: owner.id,
      })),
    );
    await expect(
      requestAiImage(ctx, { adAccountId: acc.id, prompt: 'Ảnh serum mới' }, { enqueue: recordingEnqueue() }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { reason: 'daily_limit' } });
  });
});
