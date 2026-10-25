import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

/**
 * E04 Báo cáo theo lịch gửi khách (PRD P0-17): mang tên agency; link công khai (hạn 30 ngày) và/hoặc PDF
 * đính kèm. Không có số liệu trong thân email (số nằm trong báo cáo đã kiểm đối chiếu).
 */
export function scheduledReportEmail(input: {
  locale: 'vi' | 'en';
  to: string;
  agencyName: string;
  clientName: string;
  periodLabel: string;
  link: string;
  pdf?: { filename: string; content: Uint8Array } | null;
  replyTo?: string | null;
}): EmailMessage {
  const en = input.locale === 'en';
  const subject = en
    ? `${input.clientName} — Meta Ads report ${input.periodLabel}`
    : `${input.clientName} — Báo cáo Meta Ads ${input.periodLabel}`;
  const body = en
    ? `${input.agencyName} has prepared your Meta Ads report for ${input.periodLabel}. Figures match Ads Manager.`
    : `${input.agencyName} gửi bạn báo cáo Meta Ads kỳ ${input.periodLabel}. Số liệu đã đối chiếu khớp Ads Manager.`;
  const cta = en ? 'Open report' : 'Xem báo cáo';
  const att = input.pdf ? (en ? 'The PDF version is attached.' : 'Bản PDF được đính kèm.') : '';
  return {
    to: input.to,
    subject,
    text: `${body}\n${cta}: ${input.link}${att ? `\n${att}` : ''}`,
    html: layout(
      `<h1 style="font-size:18px">${escapeHtml(subject)}</h1><p>${escapeHtml(body)}</p>
       <p><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${cta}</a></p>
       ${att ? `<p style="color:#64748B">${att}</p>` : ''}`,
      escapeHtml(input.agencyName),
    ),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.pdf
      ? { attachments: [{ filename: input.pdf.filename, content: input.pdf.content, contentType: 'application/pdf' }] }
      : {}),
  };
}
