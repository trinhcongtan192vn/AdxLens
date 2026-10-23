import { eq } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';

/**
 * Lịch gửi báo cáo đang bật của mọi workspace cho scheduler mỗi giờ. Truy vấn XUYÊN WORKSPACE có chủ đích
 * (CLAUDE.md quy tắc 1): chỉ trả định danh + cấu hình thời điểm; mỗi lần chạy xử lý trong đúng workspace.
 */
export async function enabledReportSchedules(db: Db) {
  return db
    .select({
      id: schema.reportSchedules.id,
      workspaceId: schema.reportSchedules.workspaceId,
      cadence: schema.reportSchedules.cadence,
      weekday: schema.reportSchedules.weekday,
      monthDay: schema.reportSchedules.monthDay,
      sendHour: schema.reportSchedules.sendHour,
      timezone: schema.reportSchedules.timezone,
      enabled: schema.reportSchedules.enabled,
    })
    .from(schema.reportSchedules)
    .where(eq(schema.reportSchedules.enabled, true));
}
