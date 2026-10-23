import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

type Locale = 'vi' | 'en';

const ROLE: Record<Locale, Record<'manager' | 'buyer', string>> = {
  vi: { manager: 'Manager', buyer: 'Media buyer' },
  en: { manager: 'Manager', buyer: 'Media buyer' },
};

/** E02 Lời mời (bản đầu; mẫu chính thức hoàn thiện ở feature 023). */
export function invitationEmail(input: {
  locale: Locale;
  to: string;
  workspaceName: string;
  inviterName: string;
  role: 'manager' | 'buyer';
  link: string;
  days: number;
}): EmailMessage {
  const ws = escapeHtml(input.workspaceName);
  const who = escapeHtml(input.inviterName);
  const role = ROLE[input.locale][input.role];
  if (input.locale === 'en') {
    return {
      to: input.to,
      subject: `${input.inviterName} invited you to ${input.workspaceName} on AdxLens`,
      text: `${input.inviterName} invited you to join ${input.workspaceName} as ${role}.\nAccept: ${input.link}\nThis invitation is valid for ${input.days} days.`,
      html: layout(
        `<h1 style="font-size:18px">You're invited to ${ws}</h1>
         <p>${who} invited you to join <b>${ws}</b> on AdxLens as <b>${role}</b>.</p>
         <p><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
         <p style="color:#64748B">This invitation is valid for ${input.days} days.</p>`,
      ),
    };
  }
  return {
    to: input.to,
    subject: `${input.inviterName} mời bạn vào ${input.workspaceName} trên AdxLens`,
    text: `${input.inviterName} mời bạn tham gia ${input.workspaceName} với vai trò ${role}.\nChấp nhận: ${input.link}\nLời mời có hiệu lực ${input.days} ngày.`,
    html: layout(
      `<h1 style="font-size:18px">Bạn được mời vào ${ws}</h1>
       <p>${who} mời bạn tham gia <b>${ws}</b> trên AdxLens với vai trò <b>${role}</b>.</p>
       <p><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Chấp nhận lời mời</a></p>
       <p style="color:#64748B">Lời mời có hiệu lực ${input.days} ngày.</p>`,
    ),
  };
}
