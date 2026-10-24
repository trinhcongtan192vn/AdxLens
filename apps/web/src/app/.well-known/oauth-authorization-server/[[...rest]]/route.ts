import { authorizationServerMetadata } from '@/server/oauth';
import { json, route } from '@/server/route';

/** RFC 8414: metadata máy chủ cấp quyền cho connector MCP (ADR-0022 B). */
export const GET = route({
  auth: 'public',
  handler: async ({ req }) =>
    json(authorizationServerMetadata(req), { headers: { 'access-control-allow-origin': '*' } }),
});
