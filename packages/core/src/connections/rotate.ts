import { and, eq, ne } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { WorkspaceCtx } from '@adxlens/core/shared';
import { decryptToken, encryptToken, type TokenKeys } from './crypto';

const { metaConnections } = schema;

/**
 * Xoay khóa mã hóa token (L3 5.4, runbook `rotate-token-key`): giải mã bằng khóa cũ, mã hóa lại bằng khóa hiện
 * tại cho mọi kết nối của một workspace. Chỉ chạy trong worker / CLI (nơi có khóa). Token rõ chỉ tồn tại trong
 * bộ nhớ của vòng lặp, không log. Kết nối đã thu hồi (token đã xóa) bỏ qua.
 */
export async function reencryptWorkspaceTokens(
  ctx: WorkspaceCtx,
  keys: { keys: TokenKeys; current: number },
): Promise<{ rotated: number; skipped: number }> {
  const target = keys.keys[keys.current];
  if (!target) throw new Error('Thiếu khóa hiện tại');
  const rows = await ctx.db
    .select({
      id: metaConnections.id,
      ciphertext: metaConnections.tokenCiphertext,
      version: metaConnections.tokenKeyVersion,
    })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), ne(metaConnections.status, 'revoked')));
  let rotated = 0;
  let skipped = 0;
  for (const r of rows) {
    const old = keys.keys[r.version];
    if (r.version === keys.current || !old || r.ciphertext.length < 29) {
      skipped++;
      continue;
    }
    const blob = encryptToken(decryptToken(r.ciphertext, old), target);
    await ctx.db
      .update(metaConnections)
      .set({ tokenCiphertext: blob, tokenKeyVersion: keys.current })
      .where(
        and(
          eq(metaConnections.workspaceId, ctx.workspaceId),
          eq(metaConnections.id, r.id),
          eq(metaConnections.tokenKeyVersion, r.version),
        ),
      );
    rotated++;
  }
  return { rotated, skipped };
}
