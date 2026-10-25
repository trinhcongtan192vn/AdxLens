import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { keysFromEnv } from '@adxlens/core/connections';
import { disableFlag, enableFlag } from '@adxlens/core/flags';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  AI_IMAGE_MAX_PENDING,
  getLlmKey,
  openaiImageClient,
  requestAiImage,
  runAiImage,
  saveLlmKey,
  workspaceImageGenerator,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 21).toString('base64') });
const OAI = 'sk-proj-CCCCCCCCCCCCCCCCCCCCCCCCimgs';
const ANT = 'sk-ant-api03-DDDDDDDDDDDDDDDDDDDDDDDDanth';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, {
      workspaceId: workspace.id,
      key,
      staffUserId: pm.id,
      reason: 'test ai image',
      override: true,
    });
  }
  return { ctx, wctx: { db, workspaceId: workspace.id }, acc: acc.id, pm };
}

describe('AI tạo ảnh (ADR-0027)', () => {
  it('cần khóa OpenAI; tạo bản nháp generating + job; giới hạn số ảnh đang tạo', async () => {
    const s = await setup();
    const enqueue = recordingEnqueue();
    const input = { adAccountId: s.acc, prompt: 'Ảnh serum trên nền đá' };
    await expect(requestAiImage(s.ctx, input, { enqueue })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'no_openai_key' },
    });
    await saveLlmKey(s.ctx, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: ANT }, KEYS);
    await expect(requestAiImage(s.ctx, input, { enqueue })).rejects.toMatchObject({ code: 'CONFLICT' });
    await saveLlmKey(s.ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    await expect(requestAiImage(s.ctx, { ...input, prompt: 'abc' }, { enqueue })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const d = await requestAiImage(s.ctx, input, { enqueue });
    expect(d).toMatchObject({ source: 'ai', status: 'generating', prompt: input.prompt });
    expect(enqueue.calls).toEqual([
      expect.objectContaining({
        name: 'recommend:creative_image',
        payload: { workspaceId: s.ctx.workspaceId, draftId: d.id },
      }),
    ]);
    for (let i = 1; i < AI_IMAGE_MAX_PENDING; i++) await requestAiImage(s.ctx, input, { enqueue });
    await expect(requestAiImage(s.ctx, input, { enqueue })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'too_many' },
    });
  });

  it('worker: OpenAI Images → lưu PNG theo workspace → ready; lỗi chỉ ghi mã; cờ tắt / không khóa → failed', async () => {
    const s = await setup();
    await saveLlmKey(s.ctx, { provider: 'openai', model: 'gpt-5', apiKey: OAI }, KEYS);
    const enqueue = recordingEnqueue();
    const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: (init.headers as Record<string, string>).authorization!,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const saved = new Map<string, Uint8Array>();
    const save = async (path: string, bytes: Uint8Array) => void saved.set(path, bytes);

    const d = await requestAiImage(s.ctx, { adAccountId: s.acc, prompt: 'Ảnh serum' }, { enqueue });
    const gen = (await workspaceImageGenerator(s.wctx, KEYS.keys, { fetchImpl: ok }))!;
    expect(await runAiImage(s.wctx, d.id, { generator: gen, save })).toEqual({ status: 'ready' });
    expect(calls[0]).toMatchObject({
      url: 'https://api.openai.com/v1/images/generations',
      auth: `Bearer ${OAI}`,
      body: { model: 'gpt-image-1', prompt: 'Ảnh serum', n: 1 },
    });
    const path = `${s.ctx.workspaceId}/${s.acc}/${d.id}.png`;
    expect([...saved.keys()]).toEqual([path]);
    const [row] = await db.select().from(schema.creativeDrafts).where(eq(schema.creativeDrafts.id, d.id));
    expect(row).toMatchObject({ status: 'ready', storagePath: path, contentType: 'image/png' });
    // Chạy lại job (đã xong) → bỏ qua.
    expect(await runAiImage(s.wctx, d.id, { generator: gen, save })).toEqual({ status: 'missing' });

    // Lỗi từ OpenAI: chỉ mã HTTP, không khóa / nội dung.
    const bad = (async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${OAI}` } }), {
        status: 401,
      })) as unknown as typeof fetch;
    const d2 = await requestAiImage(s.ctx, { adAccountId: s.acc, prompt: 'Ảnh thứ hai' }, { enqueue });
    const gen2 = (await workspaceImageGenerator(s.wctx, KEYS.keys, { fetchImpl: bad }))!;
    expect(await runAiImage(s.wctx, d2.id, { generator: gen2, save })).toEqual({
      status: 'failed',
      code: 'LLM_HTTP_401',
    });
    expect((await getLlmKey(s.ctx))!.lastError).toBe('LLM_HTTP_401');

    const d3 = await requestAiImage(s.ctx, { adAccountId: s.acc, prompt: 'Ảnh thứ ba' }, { enqueue });
    expect(await runAiImage(s.wctx, d3.id, { generator: null, save })).toEqual({
      status: 'failed',
      code: 'no_openai_key',
    });
    const d4 = await requestAiImage(s.ctx, { adAccountId: s.acc, prompt: 'Ảnh thứ tư' }, { enqueue });
    await disableFlag(db, {
      workspaceId: s.ctx.workspaceId,
      key: 'p2a_approve',
      staffUserId: s.pm.id,
      reason: 'tắt thử',
    });
    expect(await runAiImage(s.wctx, d4.id, { generator: gen, save })).toEqual({
      status: 'failed',
      code: 'feature_disabled',
    });
    expect(saved.size).toBe(1);
  });

  it('client OpenAI Images: ảnh rỗng → mã lỗi riêng', async () => {
    const empty = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(openaiImageClient({ apiKey: OAI, fetchImpl: empty }).generate('x')).rejects.toThrow('LLM_EMPTY_IMAGE');
  });
});
