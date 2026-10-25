import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { mergeAlertRecipients, opsAlertEmails, registerIncidentSink, teamAlertSink } from '@adxlens/core/ops';
import { deps } from './deps';

let registered = false;

/** Kênh báo đội cho sự cố mở từ web (kill switch toàn cục…). Đọc cấu hình lúc gửi; không cấu hình → bỏ qua. */
export function registerWebIncidentSink(): void {
  if (registered) return;
  registered = true;
  registerIncidentSink(async (a) => {
    const env = getEnv();
    // `OPS_ALERT_EMAILS` + danh sách superadmin đặt ở /admin/system (đọc lúc gửi).
    const recipients = mergeAlertRecipients(env.OPS_ALERT_EMAILS, await opsAlertEmails(deps().db));
    if (!recipients.length && !env.OPS_SLACK_WEBHOOK_URL) return;
    await teamAlertSink({
      email: deps().email,
      recipients,
      slackWebhookUrl: env.OPS_SLACK_WEBHOOK_URL,
      appUrl: env.APP_URL,
    })(a);
  });
}
