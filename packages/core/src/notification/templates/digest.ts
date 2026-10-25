import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

export type DigestAccountRow = {
  name: string;
  clientName: string | null;
  health: number;
  healthChange: number | null;
  newIssues: number;
  newHigh: number;
  mismatchDays: number;
};

/**
 * E03 Digest tuần (PRD P0-19): thay đổi health theo tài khoản, vấn đề mới, tài khoản lệch số liệu, lịch gửi
 * báo cáo trong tuần. Chỉ số đã tính sẵn — không có văn bản do LLM sinh.
 */
export function digestEmail(input: {
  locale: 'vi' | 'en';
  to: string;
  workspaceName: string;
  weekLabel: string;
  accounts: DigestAccountRow[];
  schedulesThisWeek: number;
  link: string;
}): EmailMessage {
  const en = input.locale === 'en';
  const subject = en ? `AdxLens weekly summary · ${input.weekLabel}` : `Tổng kết tuần AdxLens · ${input.weekLabel}`;
  const h = en
    ? { account: 'Account', health: 'Health', issues: 'New issues', mismatch: 'Days off', none: 'No ad accounts yet.' }
    : {
        account: 'Tài khoản',
        health: 'Health',
        issues: 'Vấn đề mới',
        mismatch: 'Ngày lệch',
        none: 'Chưa có tài khoản quảng cáo.',
      };
  const change = (c: number | null) => (c === null || c === 0 ? '' : ` (${c > 0 ? '+' : '−'}${Math.abs(c)})`);
  const totalNew = input.accounts.reduce((t, a) => t + a.newIssues, 0);
  const totalHigh = input.accounts.reduce((t, a) => t + a.newHigh, 0);
  const mismatched = input.accounts.filter((a) => a.mismatchDays > 0).length;
  const lines = en
    ? [
        `${totalNew} new issues this week (${totalHigh} high severity).`,
        mismatched
          ? `${mismatched} accounts had figures off from Ads Manager by more than 1%.`
          : 'All figures matched Ads Manager.',
        `${input.schedulesThisWeek} client reports are scheduled this week.`,
      ]
    : [
        `${totalNew} vấn đề mới trong tuần (${totalHigh} vấn đề mức cao).`,
        mismatched
          ? `${mismatched} tài khoản có số liệu lệch hơn 1% so với Ads Manager.`
          : 'Số liệu mọi tài khoản khớp Ads Manager.',
        `${input.schedulesThisWeek} báo cáo cho khách được lên lịch gửi trong tuần.`,
      ];
  const rows = input.accounts
    .map(
      (a) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #E2E8F0">${escapeHtml(a.name)}${a.clientName ? `<br><span style="color:#64748B">${escapeHtml(a.clientName)}</span>` : ''}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #E2E8F0;text-align:right">${a.health}${change(a.healthChange)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #E2E8F0;text-align:right">${a.newIssues}${a.newHigh ? ` (${a.newHigh} ↑)` : ''}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #E2E8F0;text-align:right">${a.mismatchDays || '—'}</td></tr>`,
    )
    .join('');
  const table = input.accounts.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse">
        <tr style="color:#64748B;text-align:left"><th style="padding:4px 8px">${h.account}</th><th style="padding:4px 8px;text-align:right">${h.health}</th><th style="padding:4px 8px;text-align:right">${h.issues}</th><th style="padding:4px 8px;text-align:right">${h.mismatch}</th></tr>${rows}</table>`
    : `<p>${h.none}</p>`;
  const textRows = input.accounts.map(
    (a) =>
      `- ${a.name}: ${h.health} ${a.health}${change(a.healthChange)}, ${h.issues} ${a.newIssues}, ${h.mismatch} ${a.mismatchDays}`,
  );
  const cta = en ? 'Open overview' : 'Mở tổng quan';
  return {
    to: input.to,
    subject,
    text: [subject, ...lines, ...textRows, `${cta}: ${input.link}`].join('\n'),
    html: layout(
      `<h1 style="font-size:18px">${escapeHtml(subject)}</h1>${lines.map((l) => `<p style="margin:4px 0">${escapeHtml(l)}</p>`).join('')}
       <div style="margin-top:12px">${table}</div>
       <p style="margin-top:16px"><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${cta}</a></p>`,
      `AdxLens · ${escapeHtml(input.workspaceName)}`,
    ),
  };
}
