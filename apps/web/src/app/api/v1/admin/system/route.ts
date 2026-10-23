import { getEnv } from '@adxlens/config/env';
import { maintenanceNotice, opsAlertEmails, systemHealth } from '@adxlens/core/ops';
import { queueAdmin } from '@/server/queue-admin';
import { route } from '@/server/route';

/** Hệ thống (staff): sức khỏe, lịch định kỳ, kênh cảnh báo (không lộ Slack webhook), thông báo bảo trì. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => {
    const env = getEnv();
    const schedules = await queueAdmin()
      .schedules()
      .catch(() => null);
    const [health, emails, maintenance] = await Promise.all([
      systemHealth(ctx.db, { appVersion: env.APP_VERSION, schedules }),
      opsAlertEmails(ctx.db),
      maintenanceNotice(ctx.db),
    ]);
    return {
      health,
      alerts: {
        emails,
        env_emails: Boolean(env.OPS_ALERT_EMAILS),
        slack_configured: Boolean(env.OPS_SLACK_WEBHOOK_URL),
      },
      maintenance,
    };
  },
});
