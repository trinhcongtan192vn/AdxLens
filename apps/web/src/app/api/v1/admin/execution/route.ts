import { executionOverview } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** Thực thi mọi workspace (staff, chỉ đọc): hành động 7 ngày, lỗi gần đây, breaker đang mở, rule đang chạy thật. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => executionOverview(ctx.db),
});
