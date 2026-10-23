import { AppError } from '@adxlens/core/shared';
import { getWorkspace, updateWorkspace } from '@adxlens/core/tenancy';
import { route } from '@/server/route';
import { isSafeSvg, sniffImage } from '@/server/storage';

const MAX_BYTES = 1024 * 1024;

/**
 * ST01 "Tải logo lên": PNG hoặc SVG, tối đa 1MB. Kiểm định dạng theo nội dung file; SVG có script,
 * handler sự kiện hay liên kết ngoài bị từ chối (logo hiển thị trên trang báo cáo công khai).
 */
export const POST = route({
  auth: 'workspace',
  permission: 'workspace.manage',
  handler: async (ctx) => {
    const form = await ctx.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION_FAILED', 'Thiếu file', { field: 'file' });
    if (file.size > MAX_BYTES)
      throw new AppError('VALIDATION_FAILED', 'File quá 1MB', { field: 'file', reason: 'too_large' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) throw new AppError('VALIDATION_FAILED', 'Chỉ nhận PNG hoặc SVG', { field: 'file', reason: 'type' });
    if (type === 'image/svg+xml' && !isSafeSvg(bytes)) {
      throw new AppError('VALIDATION_FAILED', 'SVG chứa nội dung không an toàn', {
        field: 'file',
        reason: 'unsafe_svg',
      });
    }
    const ws = await getWorkspace(ctx);
    const path = `${ctx.workspaceId}/logo-${Date.now()}.${type === 'image/png' ? 'png' : 'svg'}`;
    await ctx.storage.upload('brand', path, bytes, type);
    if (ws.brand.logo_path) await ctx.storage.remove('brand', [ws.brand.logo_path]).catch(() => undefined);
    await updateWorkspace(ctx, { brand: { ...ws.brand, logo_path: path } });
    return { logo_url: ctx.storage.publicUrl('brand', path) };
  },
});
