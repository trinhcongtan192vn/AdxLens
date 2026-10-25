import nodemailer from 'nodemailer';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Mặc định EMAIL_FROM; email báo cáo có thể dùng địa chỉ của agency (ST01). */
  from?: string;
  replyTo?: string;
  /** Tệp đính kèm (PDF báo cáo theo lịch). */
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
};

export type EmailSender = { send(msg: EmailMessage): Promise<void> };

/** ADR-0004: SMTP qua nodemailer (Mailpit ở local, Resend SMTP ở staging/production). */
export function smtpEmailSender(cfg: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}): EmailSender {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });
  return {
    async send(msg) {
      await transport.sendMail({
        from: msg.from ?? cfg.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        ...(msg.attachments?.length
          ? {
              attachments: msg.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content),
                contentType: a.contentType,
              })),
            }
          : {}),
      });
    },
  };
}

/** Ghi email vào mảng, dùng trong test. */
export function memoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
    },
  };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape dữ liệu người dùng (tên workspace, tên người) trước khi chèn vào HTML email. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}
