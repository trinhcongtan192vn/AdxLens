import { handleMcp } from '@adxlens/core/agent';
import { resolveApiKey } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { deps } from '@/server/deps';
import { json, route } from '@/server/route';

/** ADR-0020: 60 lời gọi / phút / khóa. */
const MCP_LIMIT_PER_MINUTE = 60;

/**
 * MCP server (Streamable HTTP, JSON-RPC 2.0) theo khóa API của workspace. Route chỉ xác thực khóa, dựng ngữ cảnh với
 * quyền của người tạo khóa, giới hạn tần suất rồi gọi `core/agent`. Không có cookie / CSRF (Bearer).
 */
export const POST = route({
  auth: 'public',
  handler: async ({ req, db }) => {
    const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const key = raw ? await resolveApiKey(db, raw) : null;
    if (!key) throw new AppError('UNAUTHENTICATED', 'Khóa API không hợp lệ hoặc đã thu hồi');
    const actor = await resolveActor(db, key.workspaceId, key.userId);
    if (!actor) throw new AppError('UNAUTHENTICATED', 'Người tạo khóa không còn trong workspace');
    const rl = await deps().rateLimiter.hit(`mcp:${key.keyId}`, MCP_LIMIT_PER_MINUTE, 60);
    if (!rl.allowed) throw new AppError('RATE_LIMITED', 'Quá nhiều lời gọi, thử lại sau ít phút');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON không hợp lệ' } }, 400);
    }
    const res = await handleMcp({ db, workspaceId: key.workspaceId, actor }, key, body);
    return res ? json(res) : new Response(null, { status: 202 });
  },
});

/** Không mở luồng SSE từ server (máy chủ không trạng thái). */
export const GET = route({
  auth: 'public',
  handler: async () => new Response(null, { status: 405, headers: { allow: 'POST' } }),
});
