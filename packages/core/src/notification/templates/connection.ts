import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

/** Kết nối Meta sắp hết hạn / đã hết hạn (playbook `token_expiring`). `daysLeft` ≤ 0 = đã hết hạn. */
export function connectionExpiringEmail(input: {
  locale: 'vi' | 'en';
  to: string;
  workspaceName: string;
  daysLeft: number;
  link: string;
}): EmailMessage {
  const expired = input.daysLeft <= 0;
  const button = (label: string) =>
    `<p><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${label}</a></p>`;
  const en = input.locale === 'en';
  const subject = en
    ? expired
      ? `Meta connection expired in ${input.workspaceName}`
      : `Meta connection in ${input.workspaceName} expires in ${input.daysLeft} days`
    : expired
      ? `Kết nối Meta của ${input.workspaceName} đã hết hạn`
      : `Kết nối Meta của ${input.workspaceName} hết hạn sau ${input.daysLeft} ngày`;
  const body = en
    ? expired
      ? 'Syncing has stopped. Reconnect Meta (read-only) so reports keep matching Ads Manager.'
      : 'Reconnect Meta (read-only) before it expires so syncing is not interrupted.'
    : expired
      ? 'Đồng bộ đã dừng. Kết nối lại Meta (chỉ đọc) để báo cáo tiếp tục khớp Ads Manager.'
      : 'Kết nối lại Meta (chỉ đọc) trước khi hết hạn để đồng bộ không bị gián đoạn.';
  const cta = en ? 'Reconnect Meta' : 'Kết nối lại Meta';
  return {
    to: input.to,
    subject,
    text: `${subject}\n${body}\n${cta}: ${input.link}`,
    html: layout(`<h1 style="font-size:18px">${escapeHtml(subject)}</h1><p>${body}</p>${button(cta)}`),
  };
}
