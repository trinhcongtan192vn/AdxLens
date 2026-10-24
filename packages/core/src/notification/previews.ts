import type { EmailMessage } from './email';
import { ALERT_EMAIL_KINDS, alertEmail } from './templates/alerts';
import { connectionExpiringEmail } from './templates/connection';
import { dataDeletionEmail } from './templates/deletion';
import { digestEmail } from './templates/digest';
import { invitationEmail } from './templates/invitation';
import { scheduledReportEmail } from './templates/scheduled-report';

type Locale = 'vi' | 'en';

/** Dữ liệu mẫu cố định (không phải dữ liệu khách) để đội xem trước mẫu email E01–E07 ở trang admin. */
const SAMPLE = {
  to: 'owner@agency-mau.vn',
  workspace: 'Agency Mẫu',
  link: 'https://app.adxlens.com/overview',
  params: {
    account: 'Cà phê Nhà Rang',
    client: 'Cà phê Nhà Rang',
    count: 3,
    date: '20/10/2026',
    dates: '18/10, 20/10',
    days: 7,
    item: 'Giảm ngân sách nhóm "Remarketing 30 ngày"',
    plan: 'Growth',
    reason: 'reconciliation',
    report: 'Báo cáo tháng 10',
    summary: 'Chi tiêu 12.500.000 VND, 240 kết quả',
    week: '19/10 – 25/10',
  },
};

export type EmailPreview = { key: string; message: EmailMessage };

/** Mọi mẫu email (vi / en) dựng bằng dữ liệu mẫu cho trang xem trước của admin. */
export function emailPreviews(locale: Locale): EmailPreview[] {
  const base = { locale, to: SAMPLE.to };
  const out: EmailPreview[] = [
    {
      key: 'invitation',
      message: invitationEmail({
        ...base,
        workspaceName: SAMPLE.workspace,
        inviterName: 'Nguyễn An',
        role: 'buyer',
        link: SAMPLE.link,
        days: 7,
      }),
    },
    {
      key: 'connection_expiring',
      message: connectionExpiringEmail({ ...base, workspaceName: SAMPLE.workspace, daysLeft: 5, link: SAMPLE.link }),
    },
    {
      key: 'data_deletion',
      message: dataDeletionEmail({
        ...base,
        workspaceName: SAMPLE.workspace,
        code: 'XD-MAU12345',
        phase: 'scheduled',
        purgeBy: '30/10/2026',
        statusLink: SAMPLE.link,
      }),
    },
    {
      key: 'digest',
      message: digestEmail({
        ...base,
        workspaceName: SAMPLE.workspace,
        weekLabel: SAMPLE.params.week,
        accounts: [
          {
            name: 'Cà phê Nhà Rang',
            clientName: 'Cà phê Nhà Rang',
            health: 82,
            healthChange: -4,
            newIssues: 2,
            newHigh: 1,
            mismatchDays: 0,
          },
          {
            name: 'Thời trang Linh',
            clientName: null,
            health: 64,
            healthChange: 3,
            newIssues: 1,
            newHigh: 0,
            mismatchDays: 1,
          },
        ],
        schedulesThisWeek: 2,
        link: SAMPLE.link,
      }),
    },
    {
      key: 'scheduled_report',
      message: scheduledReportEmail({
        ...base,
        agencyName: SAMPLE.workspace,
        clientName: SAMPLE.params.client,
        periodLabel: '01/10 – 31/10/2026',
        link: SAMPLE.link,
      }),
    },
  ];
  for (const kind of ALERT_EMAIL_KINDS) {
    out.push({
      key: `alert_${kind}`,
      message: alertEmail({ ...base, kind, workspaceName: SAMPLE.workspace, params: SAMPLE.params, link: SAMPLE.link }),
    });
  }
  return out;
}
