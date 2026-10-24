import { protectedResourceMetadata } from '@/server/oauth';

/**
 * RFC 9728 cho MCP endpoint (ADR-0022 B). Cả dạng có hậu tố đường dẫn `/api/v1/mcp` mà một số client gọi. Handler thường
 * (không qua `route()`: params catch-all là mảng; không đọc dữ liệu, không cần phiên).
 */
export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(req), { headers: { 'access-control-allow-origin': '*' } });
}
