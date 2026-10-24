import { protectedResourceMetadata } from '@/server/oauth';
import { json, route } from '@/server/route';

/** RFC 9728 cho MCP endpoint (ADR-0022 B). Cả dạng có hậu tố đường dẫn `/api/v1/mcp` mà một số client gọi. */
export const GET = route({
  auth: 'public',
  handler: async ({ req }) => json(protectedResourceMetadata(req), { headers: { 'access-control-allow-origin': '*' } }),
});
