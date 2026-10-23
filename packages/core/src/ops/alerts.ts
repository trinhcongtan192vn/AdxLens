import type { EmailSender } from '@adxlens/core/notification';

/** Dữ liệu cảnh báo nội bộ — chỉ định danh và mô tả chung, không tên khách / campaign / token (L3 19.2). */
export type IncidentAlert = {
  id: string;
  kind: string;
  severity: 'P1' | 'P2' | 'P3';
  title: string;
  fingerprint: string;
  workspaceId: string | null;
  occurrences: number;
  escalated: boolean;
};

export type IncidentSink = (a: IncidentAlert) => Promise<void>;

const sinks: IncidentSink[] = [];

/** Web / worker đăng ký kênh báo đội AdxLens (email nội bộ, Slack) khi khởi động. */
export function registerIncidentSink(sink: IncidentSink): void {
  sinks.push(sink);
}

export function resetIncidentSinks(): void {
  sinks.length = 0;
}

/** Gửi tới mọi kênh; lỗi kênh không làm hỏng luồng mở sự cố (kênh tự ghi log). */
export async function dispatchIncidentAlert(a: IncidentAlert): Promise<void> {
  if (a.severity === 'P3') return;
  await Promise.all(sinks.map((s) => s(a).catch(() => undefined)));
}

/**
 * Kênh báo đội (L3 12, L2 11): email tới `OPS_ALERT_EMAILS` và/hoặc Slack incoming webhook. Không có cấu hình
 * → không gửi (local). Nội dung chỉ gồm mức, loại, tiêu đề chung, link trang Sự cố.
 */
export function teamAlertSink(cfg: {
  email?: EmailSender;
  recipients: string[];
  slackWebhookUrl?: string | null;
  appUrl: string;
  fetchImpl?: typeof fetch;
}): IncidentSink {
  return async (a) => {
    const link = `${cfg.appUrl}/admin/incidents?id=${a.id}`;
    const subject = `[AdxLens ${a.severity}] ${a.title}${a.escalated ? ' (nâng mức)' : ''}`;
    const text = `${subject}\nLoại: ${a.kind}\nSố lần: ${a.occurrences}\n${link}`;
    if (cfg.email) {
      for (const to of cfg.recipients) {
        await cfg.email.send({
          to,
          subject,
          text,
          html: `<p>${subject}</p><p>Loại: ${a.kind} · Số lần: ${a.occurrences}</p><p><a href="${link}">Mở trang Sự cố</a></p>`,
        });
      }
    }
    if (cfg.slackWebhookUrl) {
      await (cfg.fetchImpl ?? fetch)(cfg.slackWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }
  };
}
