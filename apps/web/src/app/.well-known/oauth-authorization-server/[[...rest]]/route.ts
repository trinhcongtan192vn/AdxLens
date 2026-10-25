import { authorizationServerMetadata } from '@/server/oauth';

/** RFC 8414: metadata máy chủ cấp quyền cho connector MCP (ADR-0022 B). Handler thường như `oauth-protected-resource`. */
export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(req), { headers: { 'access-control-allow-origin': '*' } });
}
