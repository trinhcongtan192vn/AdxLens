import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  addCreativeDraft,
  assertCreativeAccount,
  CREATIVE_IMAGE_MAX_BYTES,
  listCreativeDrafts,
  sniffCreativeImage,
} from '@adxlens/core/execution';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

/** ADR-0027: bản nháp creative của một tài khoản QC (ảnh xem qua URL có chữ ký 1 giờ, bucket private). Sau cờ P2a. */
export const GET = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  query: z.object({ ad_account_id: z.string().uuid() }),
  handler: async (ctx, { query }) => {
    const rows = await listCreativeDrafts(ctx, query.ad_account_id);
    return {
      items: await Promise.all(
        rows.map(async (d) => ({
          id: d.id,
          source: d.source,
          status: d.status,
          prompt: d.prompt,
          error: d.error,
          created_at: d.createdAt.toISOString(),
          url:
            d.status === 'ready' && d.storagePath
              ? await ctx.storage.signedUrl('creatives', d.storagePath, 3600)
              : null,
        })),
      ),
    };
  },
});

/** Tải ảnh lên (PNG / JPEG / WebP ≤ 5MB, kiểm theo nội dung file) → bản nháp `ready`. */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const form = await ctx.req.formData().catch(() => null);
    const file = form?.get('file');
    const adAccountId = z.string().uuid().safeParse(form?.get('ad_account_id'));
    if (!adAccountId.success) throw new AppError('VALIDATION_FAILED', 'Thiếu tài khoản QC', { field: 'ad_account_id' });
    if (!(file instanceof File)) throw new AppError('VALIDATION_FAILED', 'Thiếu file', { field: 'file' });
    if (file.size > CREATIVE_IMAGE_MAX_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'Ảnh quá 5MB', { field: 'file', reason: 'too_large' });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffCreativeImage(bytes);
    if (!type) throw new AppError('VALIDATION_FAILED', 'Chỉ nhận PNG, JPEG, WebP', { field: 'file', reason: 'type' });
    const path = `${ctx.workspaceId}/${adAccountId.data}/${randomUUID()}.${EXT[type]}`;
    // Kiểm quyền với tài khoản trước khi lưu tệp.
    await assertCreativeAccount(ctx, adAccountId.data);
    await ctx.storage.upload('creatives', path, bytes, type);
    const d = await addCreativeDraft(ctx, {
      adAccountId: adAccountId.data,
      source: 'upload',
      storagePath: path,
      contentType: type,
    });
    return { id: d.id };
  },
});
