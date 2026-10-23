import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

type Locale = 'vi' | 'en';
type P = Record<string, string | number>;

/**
 * Nội dung email theo loại thông báo (cùng nội dung với trung tâm thông báo — P0-25). Tham số là số/chuỗi
 * đã tính; không có nội dung do LLM sinh.
 */
const REASON: Record<Locale, Record<string, string>> = {
  vi: {
    unconfirmed: 'có tài khoản chưa xác nhận gán Client',
    reconciliation: 'số liệu lệch hơn 1% so với Ads Manager',
    connection_revoked: 'kết nối Meta đã bị ngắt',
    build_failed: 'không dựng được báo cáo',
    demo: 'Client dùng dữ liệu mẫu',
  },
  en: {
    unconfirmed: 'an account has no confirmed Client',
    reconciliation: 'figures differ from Ads Manager by more than 1%',
    connection_revoked: 'the Meta connection was disconnected',
    build_failed: 'the report could not be built',
    demo: 'the Client uses sample data',
  },
};
const reason = (l: Locale, code: string | number | undefined) => REASON[l][String(code)] ?? String(code ?? '');

const TEXT: Record<string, Record<Locale, (p: P) => { subject: string; body: string; cta: string }>> = {
  sync_done: {
    vi: (p) => ({
      subject: `Đồng bộ xong ${p.account}`,
      body: `Dữ liệu 90 ngày của ${p.account} đã sẵn sàng.`,
      cta: 'Xem tổng quan',
    }),
    en: (p) => ({
      subject: `${p.account} is synced`,
      body: `90 days of data for ${p.account} are ready.`,
      cta: 'View overview',
    }),
  },
  reconciliation_warning: {
    vi: (p) => ({
      subject: `Số liệu ${p.account} lệch hơn 1% so với Ads Manager`,
      body: `Ngày lệch: ${p.dates}. Báo cáo liên quan tạm khóa chia sẻ; hệ thống tự đồng bộ và đối chiếu lại sau 24 giờ.`,
      cta: 'Xem đối chiếu',
    }),
    en: (p) => ({
      subject: `${p.account} differs from Ads Manager by more than 1%`,
      body: `Days affected: ${p.dates}. Related reports can't be shared for now; we re-sync and reconcile again in 24 hours.`,
      cta: 'View reconciliation',
    }),
  },
  token_expiring: {
    vi: (p) => ({
      subject: `Kết nối Meta hết hạn sau ${p.days} ngày`,
      body: 'Kết nối lại Meta (chỉ đọc) để đồng bộ không bị gián đoạn.',
      cta: 'Kết nối lại',
    }),
    en: (p) => ({
      subject: `Meta connection expires in ${p.days} days`,
      body: 'Reconnect Meta (read-only) so syncing is not interrupted.',
      cta: 'Reconnect',
    }),
  },
  token_expired: {
    vi: () => ({
      subject: 'Kết nối Meta đã hết hạn',
      body: 'Đồng bộ đã dừng. Kết nối lại để báo cáo tiếp tục khớp Ads Manager.',
      cta: 'Kết nối lại',
    }),
    en: () => ({
      subject: 'Meta connection expired',
      body: 'Syncing has stopped. Reconnect so reports keep matching Ads Manager.',
      cta: 'Reconnect',
    }),
  },
  report_viewed: {
    vi: (p) => ({
      subject: `${p.client} đã mở báo cáo`,
      body: `Khách đã mở báo cáo "${p.report}".`,
      cta: 'Xem báo cáo',
    }),
    en: (p) => ({
      subject: `${p.client} opened the report`,
      body: `Your client opened "${p.report}".`,
      cta: 'View report',
    }),
  },
  report_sent: {
    vi: (p) => ({
      subject: `Đã gửi báo cáo cho ${p.client}`,
      body: `Báo cáo "${p.report}" đã được gửi theo lịch.`,
      cta: 'Xem báo cáo',
    }),
    en: (p) => ({
      subject: `Report sent to ${p.client}`,
      body: `"${p.report}" was sent on schedule.`,
      cta: 'View report',
    }),
  },
  report_postponed: {
    vi: (p) => ({
      subject: `Hoãn gửi báo cáo cho ${p.client}`,
      body: `Lý do: ${reason('vi', p.reason)}. Xử lý xong, báo cáo sẽ gửi ở lần chạy tiếp theo.`,
      cta: 'Xem lịch gửi',
    }),
    en: (p) => ({
      subject: `Report to ${p.client} postponed`,
      body: `Reason: ${reason('en', p.reason)}. Once fixed, it goes out on the next run.`,
      cta: 'View schedules',
    }),
  },
  report_needs_approval: {
    vi: (p) => ({
      subject: `Báo cáo cho ${p.client} chờ duyệt`,
      body: `Báo cáo "${p.report}" đã dựng xong theo lịch và chờ bạn duyệt trước khi gửi khách.`,
      cta: 'Duyệt báo cáo',
    }),
    en: (p) => ({
      subject: `Report for ${p.client} awaiting approval`,
      body: `"${p.report}" was built on schedule and needs your approval before it goes to the client.`,
      cta: 'Review report',
    }),
  },
  weekly_digest: {
    vi: (p) => ({ subject: `Tổng kết tuần ${p.week}`, body: `${p.summary}`, cta: 'Mở tổng quan' }),
    en: (p) => ({ subject: `Weekly summary ${p.week}`, body: `${p.summary}`, cta: 'Open overview' }),
  },
  billing_failed: {
    vi: () => ({
      subject: 'Thanh toán không thành công',
      body: 'Cập nhật phương thức thanh toán để tránh gián đoạn dịch vụ.',
      cta: 'Cập nhật thanh toán',
    }),
    en: () => ({
      subject: 'Payment failed',
      body: 'Update your payment method to avoid service interruption.',
      cta: 'Update payment',
    }),
  },
  billing_renewal: {
    vi: (p) => ({
      subject: `Gói ${p.plan} hết hạn ngày ${p.date}`,
      body: `Gói ${p.plan} của workspace hết hạn ngày ${p.date}. Thanh toán kỳ tiếp theo để không bị gián đoạn.`,
      cta: 'Gia hạn',
    }),
    en: (p) => ({
      subject: `Your ${p.plan} plan expires on ${p.date}`,
      body: `The workspace's ${p.plan} plan expires on ${p.date}. Pay for the next period to avoid interruption.`,
      cta: 'Renew',
    }),
  },
  budget_pacing: {
    vi: (p) => ({
      subject: `${p.client}: ngân sách tháng ${p.month} dự kiến ${p.status === 'over' ? 'vượt' : 'thiếu'} ${p.pct}%`,
      body: `Theo tốc độ chi hiện tại, Client ${p.client} sẽ ${p.status === 'over' ? 'chi vượt' : 'chi thiếu'} khoảng ${p.pct}% ngân sách tháng ${p.month}. Xem tiến độ và mức chi mỗi ngày cần điều chỉnh.`,
      cta: 'Xem ngân sách',
    }),
    en: (p) => ({
      subject: `${p.client}: ${p.month} budget projected ${p.status === 'over' ? 'over' : 'under'} by ${p.pct}%`,
      body: `At the current pace, ${p.client} will ${p.status === 'over' ? 'overspend' : 'underspend'} its ${p.month} budget by about ${p.pct}%. See pacing and the daily spend needed.`,
      cta: 'View budget',
    }),
  },
  anomaly: {
    vi: (p) => ({
      subject: `${p.account}: ${p.summary}`,
      body: `Ngày ${p.date}, tài khoản ${p.account} có biến động bất thường: ${p.summary}. Kiểm tra trước khi khách hỏi.`,
      cta: 'Xem tài khoản',
    }),
    en: (p) => ({
      subject: `${p.account}: ${p.summary}`,
      body: `On ${p.date}, account ${p.account} had an unusual change: ${p.summary}. Check it before the client asks.`,
      cta: 'View account',
    }),
  },
  weekly_actions: {
    vi: (p) => ({
      subject: `Việc tuần này: ${p.count} gợi ý`,
      body: `Danh sách việc tuần ${p.week} đã sẵn sàng với ${p.count} gợi ý, xếp theo tác động.`,
      cta: 'Xem việc tuần này',
    }),
    en: (p) => ({
      subject: `This week: ${p.count} actions`,
      body: `The action list for the week of ${p.week} is ready with ${p.count} suggestions, ranked by impact.`,
      cta: 'Open this week',
    }),
  },
  action_assigned: {
    vi: (p) => ({ subject: `Bạn được giao việc: ${p.item}`, body: `Tài khoản ${p.account}.`, cta: 'Xem việc' }),
    en: (p) => ({ subject: `Assigned to you: ${p.item}`, body: `Account ${p.account}.`, cta: 'Open' }),
  },
  action_executed: {
    vi: (p) => ({
      subject: `Đã thực hiện: ${p.item}`,
      body: 'Thay đổi đã được áp dụng và xác minh trên Meta.',
      cta: 'Xem nhật ký',
    }),
    en: (p) => ({ subject: `Done: ${p.item}`, body: 'The change was applied and verified on Meta.', cta: 'Open log' }),
  },
  action_failed: {
    vi: (p) => ({
      subject: 'Hành động trên Meta thất bại',
      body: `${p.action}: ${p.reason}. Không có thay đổi nào được giữ lại.`,
      cta: 'Xem nhật ký',
    }),
    en: (p) => ({
      subject: 'Meta action failed',
      body: `${p.action}: ${p.reason}. No change was kept.`,
      cta: 'View log',
    }),
  },
};

export const ALERT_EMAIL_KINDS = Object.keys(TEXT);

export function alertEmail(input: {
  kind: string;
  locale: Locale;
  to: string;
  workspaceName: string;
  params: P;
  link: string;
}): EmailMessage {
  const t = TEXT[input.kind]?.[input.locale];
  if (!t) throw new Error(`Không có mẫu email cho ${input.kind}`);
  const { subject, body, cta } = t(input.params);
  const footer = input.locale === 'en' ? `AdxLens · ${input.workspaceName}` : `AdxLens · ${input.workspaceName}`;
  return {
    to: input.to,
    subject,
    text: `${subject}\n${body}\n${cta}: ${input.link}`,
    html: layout(
      `<h1 style="font-size:18px">${escapeHtml(subject)}</h1><p>${escapeHtml(body)}</p>
       <p><a href="${input.link}" style="background:#4F46E5;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${escapeHtml(cta)}</a></p>`,
      footer,
    ),
  };
}
