import { z } from 'zod';
import { API_KEY_SCOPES, createApiKey, listApiKeys } from '@adxlens/core/agent';
import { route } from '@/server/route';

/** Khóa API cho MCP (ADR-0020): danh sách không bao giờ có hash / khóa rõ. */
export const GET = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => ({
    items: (await listApiKeys(ctx)).map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      revoked_at: k.revokedAt?.toISOString() ?? null,
      created_at: k.createdAt.toISOString(),
    })),
  }),
});

/** Tạo khóa — khóa rõ chỉ trả ở phản hồi này. */
export const POST = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  body: z.object({
    name: z.string().trim().min(1).max(60),
    scopes: z.array(z.enum(API_KEY_SCOPES)).max(2).default(['read']),
  }),
  handler: async (ctx, { body }) => createApiKey(ctx, body),
});
