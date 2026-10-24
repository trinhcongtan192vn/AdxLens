import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askAgent, getThread, saveLlmKey, type AgentLlm } from '@adxlens/core/agent';
import { keysFromEnv } from '@adxlens/core/connections';
import { enableFlag } from '@adxlens/core/flags';
import { resolveActor } from '@adxlens/core/tenancy';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { dispatch } from '../dispatch';
import { handlers } from './index';
import { TEST_TOKEN_KEY, testWorkerServices } from '../testing';

const db = testDb();
beforeEach(() => truncateAll(db));
afterEach(() => vi.unstubAllGlobals());
afterAll(() => closeTestDb());

async function question(name: string) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test worker', override: true });
  }
  const enqueue = recordingEnqueue();
  const r = await askAgent(ctx, { threadId: null, question: 'xin chào' }, { enqueue });
  return { ctx, ...r, job: enqueue.calls[0]! };
}

const platform: AgentLlm = {
  chat: async () => ({ content: [{ type: 'text', text: 'Từ nền tảng' }], stopReason: 'end_turn' }),
};

describe('recommend:agent_reply (ADR-0022)', () => {
  it('workspace có khóa riêng → gọi nhà cung cấp bằng khóa đó, KHÔNG dùng khóa nền tảng', async () => {
    const q = await question('A');
    await saveLlmKey(
      q.ctx,
      { provider: 'openai', model: 'gpt-5', apiKey: 'sk-proj-workerTESTAAAAAAAAAAAAAAAA' },
      keysFromEnv({ TOKEN_ENC_KEY_V1: TEST_TOKEN_KEY }),
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Từ khóa riêng' } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const platformChat = vi.spyOn(platform, 'chat');
    const { services } = testWorkerServices(db);
    await dispatch(
      handlers,
      { ...services, agentLlm: platform, agentLlmModel: 'claude-sonnet-5-5' },
      {
        name: q.job.name,
        id: 'j1',
        data: q.job.payload,
      },
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://api.openai.com/v1/chat/completions');
    expect(platformChat).not.toHaveBeenCalled();
    const a = (await getThread(q.ctx, q.threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({
      content: 'Từ khóa riêng',
      data: { source: 'llm', llm: { via: 'workspace', provider: 'openai', model: 'gpt-5' } },
    });
  });

  it('không có khóa riêng → khóa nền tảng', async () => {
    const q = await question('B');
    const { services } = testWorkerServices(db);
    await dispatch(
      handlers,
      { ...services, agentLlm: platform, agentLlmModel: 'claude-sonnet-5-5' },
      {
        name: q.job.name,
        id: 'j2',
        data: q.job.payload,
      },
    );
    const a = (await getThread(q.ctx, q.threadId)).messages.find((m) => m.role === 'assistant')!;
    expect(a).toMatchObject({
      content: 'Từ nền tảng',
      data: { llm: { via: 'platform', provider: 'anthropic', model: 'claude-sonnet-5-5' } },
    });
  });
});
