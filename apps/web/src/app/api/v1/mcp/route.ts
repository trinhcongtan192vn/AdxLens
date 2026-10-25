import { handleMcp } from '@adxlens/core/agent';
import { resolveApiKey, resolveOAuthToken } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { deps } from '@/server/deps';
import { protectedResourceMetadataUrl } from '@/server/oauth';
import { json, route } from '@/server/route';

/** ADR-0020: 60 lời gọi / phút / khóa (hoặc / ứng dụng OAuth). */
const MCP_LIMIT_PER_MINUTE = 60;

/** 401 kèm chỉ dẫn discovery OAuth (MCP authorization spec): client như claude.ai / ChatGPT tự mở luồng đăng nhập. */
const unauthorized = (req: Request, message: string) =>
  json(
    { error: { code: 'UNAUTHENTICATED', message, details: {} } },
    {
      status: 401,
      headers: { 'www-authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}"` },
    },
  );

/**
 * MCP server (Streamable HTTP, JSON-RPC 2.0). Xác thực bằng khóa API của workspace (ADR-0020) hoặc access token OAuth
 * của connector (ADR-0022 B). Route chỉ xác thực, dựng ngữ cảnh với quyền của người tạo khóa / người cấp quyền, giới
 * hạn tần suất rồi gọi `core/agent`. Không có cookie / CSRF (Bearer).
 */
export const POST = route({
  auth: 'public',
  handler: async ({ req, db }) => {
    const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const cred = !raw
      ? null
      : raw.startsWith('adxo_')
        ? await resolveOAuthToken(db, raw).then((g) => g && { ...g, limitKey: `mcp:oauth:${g.grantId}` })
        : await resolveApiKey(db, raw).then((k) => k && { ...k, limitKey: `mcp:${k.keyId}` });
    if (!cred) return unauthorized(req, 'Khóa / token không hợp lệ, hết hạn hoặc đã thu hồi');
    const actor = await resolveActor(db, cred.workspaceId, cred.userId);
    if (!actor) return unauthorized(req, 'Người cấp quyền không còn trong workspace');
    const rl = await deps().rateLimiter.hit(cred.limitKey, MCP_LIMIT_PER_MINUTE, 60);
    if (!rl.allowed) throw new AppError('RATE_LIMITED', 'Quá nhiều lời gọi, thử lại sau ít phút');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON không hợp lệ' } }, 400);
    }
    const res = await handleMcp({ db, workspaceId: cred.workspaceId, actor }, cred, body);
    return res ? json(res) : new Response(null, { status: 202 });
  },
});

/** Không mở luồng SSE từ server (máy chủ không trạng thái). */
export const GET = route({
  auth: 'public',
  handler: async () => new Response(null, { status: 405, headers: { allow: 'POST' } }),
});
