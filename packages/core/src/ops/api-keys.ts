import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { schema, type Db } from '@adxlens/db';

const { apiKeys } = schema;

/** Cùng thuật toán với `agent.hashApiKey` (test khóa) — không import agent để tránh vòng phụ thuộc ops ↔ reporting. */
const hashApiKey = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');

/**
 * Xác thực khóa API của MCP (ADR-0020). TRUY VẤN XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1, chỉ được ở
 * `core/ops`): khóa là bước xác thực trước khi biết workspace, nên tra theo hash duy nhất. Trả workspace + người tạo;
 * mọi truy vấn sau đó chạy theo `workspace_id` đó với quyền của người tạo.
 */
export async function resolveApiKey(
  db: Db,
  raw: string,
): Promise<{ keyId: string; name: string; workspaceId: string; userId: string; scopes: string[] } | null> {
  if (!/^adx_[\w-]{8}_[\w-]{20,}$/.test(raw)) return null;
  const [k] = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      workspaceId: apiKeys.workspaceId,
      createdBy: apiKeys.createdBy,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.hash, hashApiKey(raw)), isNull(apiKeys.revokedAt)));
  if (!k) return null;
  // Ghi lần dùng gần nhất tối đa mỗi phút (không ghi mỗi request).
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKeys.workspaceId, k.workspaceId), eq(apiKeys.id, k.id)));
  }
  return { keyId: k.id, name: k.name, workspaceId: k.workspaceId, userId: k.createdBy, scopes: k.scopes };
}
