import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { AppError, type ActorCtx } from '@adxlens/core/shared';
import { canApproveActions } from '@adxlens/core/tenancy';

/** Nút CTA hợp lệ (web chỉ import qua core/execution — ranh giới `meta-client/write`). */
export { CREATIVE_CTAS } from '@adxlens/meta-client/write';

const { creativeDrafts } = schema;

export type CreativeDraft = typeof creativeDrafts.$inferSelect;

/** Ảnh nhận cho creative (ADR-0027): kiểm theo byte đầu, không tin phần mở rộng / Content-Type của trình duyệt. */
export const CREATIVE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export function sniffCreativeImage(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 12 &&
    String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === 'RIFF' &&
    String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Tài khoản QC người dùng được tạo creative (như Launcher: quyền duyệt hành động theo Client). */
export async function assertCreativeAccount(ctx: ActorCtx, adAccountId: string) {
  const account = (await listAdAccounts(ctx)).find((a) => a.id === adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  if (!account.clientId ? ctx.actor.role === 'buyer' : !canApproveActions(ctx.actor, account.clientId)) {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền tạo creative cho Client này');
  }
  return account;
}

/** Ghi bản nháp sau khi web đã lưu ảnh vào bucket `creatives` (đường dẫn bắt đầu bằng workspace id). */
export async function addCreativeDraft(
  ctx: ActorCtx,
  input: {
    adAccountId: string;
    source: 'upload' | 'ai';
    storagePath?: string | null;
    contentType?: string | null;
    prompt?: string | null;
    status?: 'ready' | 'generating';
  },
): Promise<CreativeDraft> {
  await assertCreativeAccount(ctx, input.adAccountId);
  if (input.storagePath && !input.storagePath.startsWith(`${ctx.workspaceId}/`)) {
    throw new AppError('VALIDATION_FAILED', 'Đường dẫn ảnh không thuộc workspace');
  }
  const [row] = await ctx.db
    .insert(creativeDrafts)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: input.adAccountId,
      source: input.source,
      status: input.status ?? 'ready',
      storagePath: input.storagePath ?? null,
      contentType: input.contentType ?? null,
      prompt: input.prompt ?? null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  return row!;
}

/** Bản nháp gần nhất của tài khoản QC (Launcher). */
export async function listCreativeDrafts(ctx: ActorCtx, adAccountId: string, limit = 24): Promise<CreativeDraft[]> {
  await assertCreativeAccount(ctx, adAccountId);
  return ctx.db
    .select()
    .from(creativeDrafts)
    .where(and(eq(creativeDrafts.workspaceId, ctx.workspaceId), eq(creativeDrafts.adAccountId, adAccountId)))
    .orderBy(desc(creativeDrafts.createdAt))
    .limit(limit);
}

export async function getCreativeDraft(ctx: ActorCtx, id: string): Promise<CreativeDraft> {
  const [row] = await ctx.db
    .select()
    .from(creativeDrafts)
    .where(and(eq(creativeDrafts.workspaceId, ctx.workspaceId), eq(creativeDrafts.id, id)));
  if (!row) throw new AppError('NOT_FOUND', 'Không tìm thấy bản nháp');
  return row;
}
