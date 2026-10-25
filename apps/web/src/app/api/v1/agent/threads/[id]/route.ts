import { z } from 'zod';
import { deleteThread, getThread, setThreadFavorite } from '@adxlens/core/agent';
import { route, uuidParam } from '@/server/route';

export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const { thread, messages } = await getThread(ctx, uuidParam(ctx, 'id'));
    return {
      id: thread.id,
      title: thread.title,
      favorite: thread.favorite,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        content: m.content,
        tools: m.data.tools ?? [],
        proposals: m.data.proposals ?? [],
        plans: m.data.plans ?? [],
        source: m.data.source ?? null,
        facts: m.data.facts ?? [],
        llm: m.data.llm ?? null,
        llmError: m.data.llmError ?? null,
        created_at: m.createdAt.toISOString(),
      })),
    };
  },
});

export const PATCH = route({
  auth: 'workspace',
  body: z.object({ favorite: z.boolean() }),
  handler: async (ctx, { body }) => {
    await setThreadFavorite(ctx, uuidParam(ctx, 'id'), body.favorite);
    return null;
  },
});

export const DELETE = route({
  auth: 'workspace',
  handler: async (ctx) => {
    await deleteThread(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
