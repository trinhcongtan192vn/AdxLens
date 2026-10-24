import { adminWorkspaceDetail } from '@adxlens/core/ops';
import { route, uuidParam } from '@/server/route';

/**
 * Tra cứu một workspace cho hỗ trợ khách (staff, ADR-0013): gói, thành viên, kết nối (không token), tài khoản QC,
 * đồng bộ / đối chiếu gần nhất, cờ, sự cố, yêu cầu xóa dữ liệu. Không trả số liệu quảng cáo.
 */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => adminWorkspaceDetail(ctx.db, uuidParam(ctx, 'id')),
});
