import type { World } from './world';

/**
 * Probe cách ly cho từng route API (`METHOD /đường/dẫn`). Route mới phải có mục ở đây, nếu không
 * `pnpm test` đỏ (L3 mục 14).
 *
 * - `workspace`: gọi bằng owner của A trong workspace A; phản hồi không được chứa chuỗi nào của B.
 *   `params`/`body` dùng tài nguyên của A. `crossParams` dùng tài nguyên của B trong ngữ cảnh A:
 *   phải bị từ chối (403/404) và không lộ dữ liệu B.
 * - `exempt`: route không đọc/ghi dữ liệu nghiệp vụ theo workspace; ghi rõ lý do.
 */
export type Probe =
  | {
      kind: 'workspace';
      as?: 'owner' | 'manager';
      params?: (w: World) => Record<string, string>;
      crossParams?: (w: World) => Record<string, string>;
      body?: (w: World) => unknown;
      /** Body tham chiếu tài nguyên của B (gọi trong ngữ cảnh A): phải bị từ chối. */
      crossBody?: (w: World) => unknown;
      query?: (w: World) => Record<string, string>;
    }
  | { kind: 'user'; body?: (w: World) => unknown }
  | { kind: 'exempt'; reason: string };

export const ROUTE_PROBES: Record<string, Probe> = {
  'GET /api/health': { kind: 'exempt', reason: 'Uptime check, không đọc dữ liệu nghiệp vụ' },
  'GET /api/v1/me': { kind: 'user' },
  'POST /api/v1/me/workspace': {
    kind: 'user',
    body: (w) => ({ workspaceId: w.b.workspace.id }),
  },
  'POST /api/v1/me/preferences': { kind: 'user', body: () => ({ period: 'last30' }) },
  'PATCH /api/v1/me/profile': { kind: 'user', body: () => ({ fullName: 'Tên mới' }) },
  'POST /api/v1/me/password': {
    kind: 'user',
    body: () => ({ currentPassword: 'correct-password', password: 'mat-khau-moi-10', confirm: 'mat-khau-moi-10' }),
  },
  'DELETE /api/v1/me/sessions': { kind: 'user' },
  'POST /api/v1/workspaces': {
    kind: 'user',
    body: () => ({ name: 'Agency Mới', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' }),
  },
  'GET /api/v1/workspace': { kind: 'workspace' },
  'PATCH /api/v1/workspace': { kind: 'workspace', body: () => ({ name: 'Alpha 2' }) },
  'DELETE /api/v1/workspace': { kind: 'workspace', body: () => ({ confirmName: 'sai-ten' }) },
  'POST /api/v1/workspace/logo': { kind: 'workspace' },
  'GET /api/v1/members': { kind: 'workspace' },
  'POST /api/v1/members/invitations': {
    kind: 'workspace',
    body: (w) => ({ email: 'moi@alpha.vn', role: 'buyer', clientAccess: [w.a.client.id] }),
  },
  'DELETE /api/v1/members/invitations/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
  },
  'POST /api/v1/members/invitations/[id]/resend': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
  },
  'PATCH /api/v1/members/[userId]': {
    kind: 'workspace',
    params: (w) => ({ userId: w.a.manager.id }),
    crossParams: (w) => ({ userId: w.b.manager.id }),
    body: () => ({ role: 'buyer' }),
  },
  'DELETE /api/v1/members/[userId]': {
    kind: 'workspace',
    params: (w) => ({ userId: w.a.manager.id }),
    crossParams: (w) => ({ userId: w.b.manager.id }),
  },
  'POST /api/v1/members/[userId]/transfer-ownership': {
    kind: 'workspace',
    params: (w) => ({ userId: w.a.manager.id }),
    crossParams: (w) => ({ userId: w.b.manager.id }),
    body: () => ({ password: 'correct-password' }),
  },
  'GET /api/v1/connections/meta/authorize': { kind: 'workspace' },
  'GET /api/v1/connections/meta/callback': { kind: 'workspace', query: () => ({ code: 'x', state: 'y' }) },
  'GET /api/v1/connections': { kind: 'workspace' },
  'GET /api/v1/connections/[id]/ad-accounts': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.connection.id }),
    crossParams: (w) => ({ id: w.b.connection.id }),
  },
  'POST /api/v1/ad-accounts/import': {
    kind: 'workspace',
    body: (w) => ({ connection_id: w.a.connection.id, meta_account_ids: ['act_111111'] }),
    crossBody: (w) => ({ connection_id: w.b.connection.id, meta_account_ids: ['act_999999'] }),
  },
  'GET /api/v1/ad-accounts': { kind: 'workspace' },
  'POST /api/v1/ad-accounts/[id]/assign': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
    body: (w) => ({ client_id: w.a.client.id }),
    crossBody: (w) => ({ client_id: w.b.client.id }),
  },
  'DELETE /api/v1/ad-accounts/[id]/assign': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
  },
  'GET /api/v1/ad-accounts/[id]/sync-status': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
  },
  'POST /api/v1/ad-accounts/[id]/sync': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
  },
  'GET /api/v1/ad-accounts/[id]/reconciliation': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
    query: () => ({ from: '2026-10-16', to: '2026-10-22' }),
  },
  'POST /api/v1/ad-accounts/[id]/resync': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
    body: () => ({ from: '2026-10-20', to: '2026-10-22' }),
  },
  'POST /api/v1/connections/[id]/disconnect': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.connection.id }),
    crossParams: (w) => ({ id: w.b.connection.id }),
  },
  'POST /api/v1/webhooks/meta': {
    kind: 'exempt',
    reason: 'Callback của Meta: xác thực bằng chữ ký HMAC, thu hồi theo meta_user_id (core/ops, có test riêng)',
  },
  'GET /api/v1/ad-accounts/[id]/findings': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
  },
  'GET /api/v1/findings/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.finding.id }),
  },
  'POST /api/v1/findings/[id]/feedback': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.finding.id }),
    body: () => ({ kind: 'seen' }),
  },
  'GET /api/v1/recommendations/outcomes': { kind: 'workspace' },
  'DELETE /api/v1/me/onboarding': { kind: 'workspace' },
  'GET /api/v1/recommendations': { kind: 'workspace', query: () => ({ week: '2026-10-19' }) },
  'PATCH /api/v1/recommendations/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.recommendation.id }),
    body: () => ({ status: 'done' }),
  },
  'GET /api/v1/recommendations/[id]/assignees': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.recommendation.id }),
  },
  'GET /api/v1/recommendations/[id]/proposal': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.recommendation.id }),
  },
  'POST /api/v1/recommendations/bulk-approve': {
    kind: 'workspace',
    body: () => ({ ids: ['00000000-0000-4000-8000-000000000000'] }),
    crossBody: (w) => ({ ids: [w.b.recommendation.id] }),
  },
  'POST /api/v1/recommendations/[id]/approve': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.recommendation.id }),
  },
  'GET /api/v1/reports': { kind: 'workspace' },
  'POST /api/v1/reports': {
    kind: 'workspace',
    body: (w) => ({ client_id: w.a.client.id, kind: 'periodic', date_from: '2026-10-16', date_to: '2026-10-22' }),
    crossBody: (w) => ({ client_id: w.b.client.id, kind: 'periodic', date_from: '2026-10-16', date_to: '2026-10-22' }),
  },
  'GET /api/v1/reports/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'PATCH /api/v1/reports/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
    body: () => ({ title: 'x' }),
  },
  'DELETE /api/v1/reports/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'POST /api/v1/reports/[id]/rebuild': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'GET /api/v1/reports/[id]/share-links': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'POST /api/v1/reports/[id]/share-links': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
    body: () => ({ expires_in_days: 7 }),
  },
  'DELETE /api/v1/share-links/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.shareLink.id }),
  },
  'POST /api/v1/public/share/[token]/unlock': {
    kind: 'exempt',
    reason: 'Trang công khai: xác thực bằng token 32 byte + mật khẩu link, không có workspace người xem (test riêng)',
  },
  'POST /api/v1/reports/[id]/pdf': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'GET /api/v1/reports/[id]/pdf': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.report.id }),
  },
  'GET /api/v1/admin/workspaces': {
    kind: 'exempt',
    reason: 'Trang nội bộ staff (AD01): xuyên workspace có chủ đích, chặn người không phải staff (admin.test.ts)',
  },
  'GET /api/v1/admin/workspaces/[id]/flags/[key]/checklist': { kind: 'exempt', reason: 'Staff AD02 (admin.test.ts)' },
  'POST /api/v1/admin/workspaces/[id]/flags/[key]': {
    kind: 'exempt',
    reason: 'Staff AD02, bật cờ chỉ PM qua core/flags (admin.test.ts)',
  },
  'GET /api/v1/admin/workspaces/[id]/flag-history': { kind: 'exempt', reason: 'Staff AD02 (admin.test.ts)' },
  'GET /api/v1/notifications': { kind: 'workspace' },
  'POST /api/v1/notifications': { kind: 'workspace' },
  'POST /api/v1/notifications/[id]/read': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.notification.id }),
  },
  'GET /api/v1/me/notification-settings': { kind: 'workspace' },
  'PATCH /api/v1/me/notification-settings': {
    kind: 'workspace',
    body: () => ({ items: [{ kind: 'sync_done', in_app: true, email: true }] }),
  },
  'GET /api/v1/report-schedules': { kind: 'workspace' },
  'POST /api/v1/report-schedules': {
    kind: 'workspace',
    body: (w) => ({
      client_id: w.a.client.id,
      cadence: 'weekly',
      weekday: 1,
      send_hour: 9,
      timezone: 'Asia/Ho_Chi_Minh',
      mode: 'auto',
      delivery: 'link',
      recipients: ['a@alpha.vn'],
    }),
    crossBody: (w) => ({
      client_id: w.b.client.id,
      cadence: 'weekly',
      weekday: 1,
      send_hour: 9,
      timezone: 'Asia/Ho_Chi_Minh',
      mode: 'auto',
      delivery: 'link',
      recipients: ['a@alpha.vn'],
    }),
  },
  'PATCH /api/v1/report-schedules/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.schedule.id }),
    body: (w) => ({
      client_id: w.a.client.id,
      cadence: 'weekly',
      weekday: 2,
      send_hour: 9,
      timezone: 'Asia/Ho_Chi_Minh',
      mode: 'auto',
      delivery: 'link',
      recipients: ['a@alpha.vn'],
    }),
  },
  'DELETE /api/v1/report-schedules/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.schedule.id }),
  },
  'POST /api/v1/report-deliveries/[id]/approve': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.delivery.id }),
  },
  'POST /api/v1/billing/checkout': { kind: 'workspace', body: () => ({ plan: 'growth', period: 'monthly' }) },
  'POST /api/v1/billing/portal': { kind: 'workspace' },
  'POST /api/v1/billing/cancel': { kind: 'workspace', body: () => ({ cancel: true }) },
  'GET /api/v1/billing/profile': { kind: 'workspace' },
  'PUT /api/v1/billing/profile': {
    kind: 'workspace',
    body: () => ({ companyName: 'Alpha Co', taxCode: '0312345678', invoiceEmail: 'billing@alpha.vn' }),
  },
  'POST /api/v1/webhooks/payos': {
    kind: 'exempt',
    reason: 'Webhook PayOS: xác minh chữ ký, tìm workspace theo mã đơn trong core/ops (có test cách ly riêng)',
  },
  'POST /api/v1/webhooks/stripe': {
    kind: 'exempt',
    reason: 'Webhook Stripe: xác minh chữ ký, tìm workspace theo mã Stripe trong core/ops (có test cách ly riêng)',
  },
  'GET /api/v1/creatives': {
    kind: 'workspace',
    query: (w) => ({ account_id: w.a.adAccount.id, from: '2026-10-09', to: '2026-10-22' }),
  },
  'GET /api/v1/creatives/compare': {
    kind: 'workspace',
    query: (w) => ({ account_id: w.a.adAccount.id, from: '2026-10-09', to: '2026-10-22', ids: '999000333,1' }),
  },
  'POST /api/v1/connections/[id]/write-access': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.connection.id }),
    crossParams: (w) => ({ id: w.b.connection.id }),
    body: () => ({ enabled: false }),
  },
  'GET /api/v1/guardrails': { kind: 'workspace' },
  'PUT /api/v1/guardrails': {
    kind: 'workspace',
    body: () => ({
      maxBudgetChangePct: '10',
      maxActionsPerDay: 3,
      minDataDays: 3,
      quietStartHour: 22,
      quietEndHour: 6,
      breakerFailures: 3,
      excludeMetaIds: [],
    }),
  },
  'GET /api/v1/actions': { kind: 'workspace' },
  'GET /api/v1/actions/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.action.id }),
  },
  'POST /api/v1/actions/[id]/undo': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.action.id }),
  },
  'GET /api/v1/kill-switch': { kind: 'workspace' },
  'POST /api/v1/kill-switch': { kind: 'workspace', body: () => ({ active: false, reason: '' }) },
  'POST /api/v1/circuit-breakers/[id]/close': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.adAccount.id }),
    crossParams: (w) => ({ id: w.b.adAccount.id }),
  },
  'POST /api/v1/actions/preview': {
    kind: 'workspace',
    body: (w) => ({ ad_account_id: w.a.adAccount.id, action_type: 'pause_ad', target_meta_id: '999999' }),
    crossBody: (w) => ({ ad_account_id: w.b.adAccount.id, action_type: 'pause_ad', target_meta_id: '999999' }),
  },
  'POST /api/v1/actions/bulk': {
    kind: 'workspace',
    body: (w) => ({ items: [{ ad_account_id: w.a.adAccount.id, action_type: 'pause_ad', target_meta_id: '999999' }] }),
    crossBody: (w) => ({
      items: [{ ad_account_id: w.b.adAccount.id, action_type: 'pause_ad', target_meta_id: '999999' }],
    }),
  },
  'GET /api/v1/admin/incidents': {
    kind: 'exempt',
    reason: 'Trang nội bộ staff: sự cố vận hành, không theo workspace; có test ở admin.test.ts',
  },
  'GET /api/v1/admin/incidents/[id]': { kind: 'exempt', reason: 'Trang nội bộ staff: sự cố vận hành' },
  'POST /api/v1/admin/incidents/[id]': { kind: 'exempt', reason: 'Trang nội bộ staff: đổi trạng thái sự cố vận hành' },
  'GET /api/v1/admin/kill-switch': {
    kind: 'exempt',
    reason: 'Trang nội bộ staff: công tắc toàn hệ thống, không đọc dữ liệu nghiệp vụ theo workspace',
  },
  'POST /api/v1/admin/kill-switch': {
    kind: 'exempt',
    reason: 'Trang nội bộ PM: công tắc toàn hệ thống; có test riêng ở admin.test.ts',
  },
  // ADR-0013: route staff, xuyên workspace có chủ đích; người không phải staff → 404 (admin-roles.test.ts).
  'GET /api/v1/admin/workspaces/[id]': {
    kind: 'exempt',
    reason: 'Staff tra cứu workspace (hỗ trợ khách): xuyên workspace có chủ đích, không token / số liệu QC',
  },
  'GET /api/v1/admin/operations': {
    kind: 'exempt',
    reason: 'Staff vận hành: đồng bộ lỗi, hàng đợi, Meta API mọi workspace (có chủ đích, không số liệu QC)',
  },
  'POST /api/v1/admin/ad-accounts/[id]/resync': {
    kind: 'exempt',
    reason: 'Staff chạy lại đồng bộ tài khoản bất kỳ, có nhật ký admin (admin-ops.test.ts)',
  },
  'GET /api/v1/admin/queues/[queue]/failed': {
    kind: 'exempt',
    reason: 'Staff xem job lỗi (không payload, lỗi đã che)',
  },
  'POST /api/v1/admin/queues/[queue]/jobs/[jobId]': {
    kind: 'exempt',
    reason: 'Staff chạy lại / bỏ job lỗi; queue ghi Meta không chạy lại (admin-ops.test.ts)',
  },
  'GET /api/v1/admin/reconciliation': {
    kind: 'exempt',
    reason: 'Staff: bảng đối chiếu mọi workspace (có chủ đích), không trả chi tiêu (admin-ops.test.ts)',
  },
  'GET /api/v1/admin/billing': {
    kind: 'exempt',
    reason: 'Staff: gói và thanh toán mọi workspace (admin-extra.test.ts)',
  },
  'PATCH /api/v1/admin/billing/plans/[key]': { kind: 'exempt', reason: 'Superadmin sửa giá gói (toàn hệ thống)' },
  'POST /api/v1/admin/workspaces/[id]/billing': {
    kind: 'exempt',
    reason: 'Superadmin tặng gói / gia hạn ân hạn cho workspace bất kỳ, có nhật ký (admin-extra.test.ts)',
  },
  'GET /api/v1/admin/deletions': {
    kind: 'exempt',
    reason: 'Staff: yêu cầu xóa dữ liệu mọi workspace (chính sách Meta)',
  },
  'GET /api/v1/admin/execution': { kind: 'exempt', reason: 'Staff: thực thi mọi workspace, chỉ đọc' },
  'POST /api/v1/admin/execution/breakers/[adAccountId]': {
    kind: 'exempt',
    reason: 'Superadmin đóng breaker (lý do + nhật ký), không gọi Meta (admin-extra.test.ts)',
  },
  'GET /api/v1/admin/system': { kind: 'exempt', reason: 'Staff: sức khỏe hệ thống, không lộ secret' },
  'PUT /api/v1/admin/system/alert-emails': {
    kind: 'exempt',
    reason: 'Superadmin đặt email cảnh báo đội (toàn hệ thống)',
  },
  'PUT /api/v1/admin/system/maintenance': {
    kind: 'exempt',
    reason: 'Superadmin đặt thông báo bảo trì (toàn hệ thống)',
  },
  'GET /api/v1/admin/emails': { kind: 'exempt', reason: 'Staff: xem trước mẫu email bằng dữ liệu mẫu cố định' },
  'GET /api/v1/admin/staff': { kind: 'exempt', reason: 'Staff: danh sách đội AdxLens, không theo workspace' },
  'POST /api/v1/admin/staff': { kind: 'exempt', reason: 'Superadmin thêm staff (admin-roles.test.ts)' },
  'PATCH /api/v1/admin/staff/[userId]': { kind: 'exempt', reason: 'Superadmin đổi vai trò staff' },
  'DELETE /api/v1/admin/staff/[userId]': { kind: 'exempt', reason: 'Superadmin gỡ staff' },
  'GET /api/v1/admin/audit': { kind: 'exempt', reason: 'Staff: nhật ký thao tác admin (operator chỉ thấy của mình)' },
  'GET /api/v1/admin/flag-proposals': { kind: 'exempt', reason: 'Staff: đề xuất bật cờ mọi workspace (AD01)' },
  'POST /api/v1/admin/flag-proposals': { kind: 'exempt', reason: 'Operator đề xuất bật cờ (admin-roles.test.ts)' },
  'POST /api/v1/admin/flag-proposals/[id]': {
    kind: 'exempt',
    reason: 'Superadmin duyệt / từ chối, bật cờ qua core/flags (admin-roles.test.ts)',
  },
  'GET /api/v1/automation-rules': { kind: 'workspace' },
  'POST /api/v1/automation-rules/[id]/copy': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.rule.id }),
    body: (w) => ({ ad_account_ids: [w.a.adAccount.id] }),
    crossBody: (w) => ({ ad_account_ids: [w.b.adAccount.id] }),
  },
  'POST /api/v1/automation-rules': {
    kind: 'workspace',
    body: (w) => ({
      adAccountId: w.a.adAccount.id,
      name: 'Probe rule',
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '1' }],
      action: { type: 'pause_ad' },
    }),
    crossBody: (w) => ({
      adAccountId: w.b.adAccount.id,
      name: 'Probe rule',
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '1' }],
      action: { type: 'pause_ad' },
    }),
  },
  'GET /api/v1/automation-rules/templates': { kind: 'workspace' },
  'GET /api/v1/automation-rules/templates/suggest': {
    kind: 'workspace',
    query: (w) => ({ template: 'pause_adset_no_results', adAccountId: w.a.adAccount.id }),
  },
  'GET /api/v1/automation-rules/effectiveness': { kind: 'workspace' },
  'POST /api/v1/automation-rules/backtest': {
    kind: 'workspace',
    body: (w) => ({
      adAccountId: w.a.adAccount.id,
      name: 'Probe rule',
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '1' }],
      action: { type: 'pause_ad' },
    }),
    crossBody: (w) => ({
      adAccountId: w.b.adAccount.id,
      name: 'Probe rule',
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '1' }],
      action: { type: 'pause_ad' },
    }),
  },
  'GET /api/v1/automation-rules/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.rule.id }),
  },
  'DELETE /api/v1/automation-rules/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.rule.id }),
  },
  'POST /api/v1/automation-rules/[id]/mode': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.rule.id }),
    body: () => ({ mode: 'paused' }),
  },
  'POST /api/v1/demo': { kind: 'workspace' },
  'DELETE /api/v1/demo': { kind: 'workspace' },
  'GET /api/v1/clients': { kind: 'workspace' },
  'POST /api/v1/clients': { kind: 'workspace', body: () => ({ name: 'Client mới' }) },
  'GET /api/v1/clients/[id]': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
  },
  'GET /api/v1/clients/[id]/budget': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
  },
  'PUT /api/v1/clients/[id]/budget': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
    body: () => ({ month: '2026-10', amount: '1000000', currency: 'VND' }),
  },
  'DELETE /api/v1/clients/[id]/budget': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
    query: () => ({ month: '2026-10' }),
  },
  'GET /api/v1/api-keys': { kind: 'workspace' },
  'POST /api/v1/api-keys': { kind: 'workspace', body: () => ({ name: 'Khóa A', scopes: ['read'] }) },
  'DELETE /api/v1/api-keys/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.apiKey.id }),
  },
  'GET /api/v1/llm-key': { kind: 'workspace' },
  'PUT /api/v1/llm-key': {
    kind: 'workspace',
    body: () => ({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      api_key: 'sk-ant-api03-isolationAAAAAAAAAAAAAAAA',
    }),
  },
  'DELETE /api/v1/llm-key': { kind: 'workspace' },
  'POST /api/v1/launcher/ads': {
    kind: 'workspace',
    body: (w) => ({ adAccountId: w.a.adAccount.id, adsetId: '999000111', creativeIds: ['999000222'], name: 'Probe' }),
  },
  'POST /api/v1/launcher/lookalikes': {
    kind: 'workspace',
    body: (w) => ({
      adAccountId: w.a.adAccount.id,
      originAudienceId: 'ca_probe',
      country: 'VN',
      ratios: [1],
      name: 'Probe',
    }),
  },
  'POST /api/v1/oauth/register': {
    kind: 'exempt',
    reason: 'Đăng ký ứng dụng OAuth trước khi có người dùng / workspace; bảng client không thuộc workspace (ADR-0022)',
  },
  'POST /api/v1/oauth/token': {
    kind: 'exempt',
    reason: 'Đổi mã / refresh token trước khi biết workspace (tra hash ở core/ops); cách ly kiểm ở agent/oauth.test.ts',
  },
  'POST /api/v1/oauth/revoke': { kind: 'exempt', reason: 'Thu hồi theo token (RFC 7009), không đọc dữ liệu nghiệp vụ' },
  'POST /api/v1/oauth/authorize': {
    kind: 'workspace',
    body: () => ({
      client_id: 'adxcl_isolationclient01',
      redirect_uri: 'https://claude.ai/cb',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
      decision: 'allow',
    }),
  },
  'GET /api/v1/oauth/grants': { kind: 'workspace' },
  'DELETE /api/v1/oauth/grants/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.oauthGrant.id }),
  },
  'POST /api/v1/mcp': {
    kind: 'exempt',
    reason: 'Xác thực bằng khóa API (workspace lấy từ khóa, không từ request); cách ly kiểm ở core/agent/mcp.test.ts',
  },
  'GET /api/v1/mcp': { kind: 'exempt', reason: 'Trả 405, không đọc dữ liệu' },
  'POST /api/v1/agent/ask': { kind: 'workspace', body: () => ({ threadId: null, question: 'Chi tiêu tuần này?' }) },
  'GET /api/v1/agent/threads': { kind: 'workspace' },
  'POST /api/v1/agent/threads/[id]/stop': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.thread.id }),
    body: () => ({ messageId: '00000000-0000-4000-8000-000000000000' }),
  },
  'GET /api/v1/agent/threads/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.thread.id }),
  },
  'PATCH /api/v1/agent/threads/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.thread.id }),
    body: () => ({ favorite: true }),
  },
  'DELETE /api/v1/agent/threads/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.thread.id }),
  },
  'GET /api/v1/alerts': { kind: 'workspace' },
  'POST /api/v1/alerts': {
    kind: 'workspace',
    body: (w) => ({
      adAccountId: w.a.adAccount.id,
      metric: 'cpm',
      condition: 'above',
      threshold: '50000',
      window: '1d',
    }),
  },
  'PATCH /api/v1/alerts/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.alert.id }),
    body: () => ({ enabled: false }),
  },
  'DELETE /api/v1/alerts/[id]': {
    kind: 'workspace',
    params: () => ({ id: '00000000-0000-4000-8000-000000000000' }),
    crossParams: (w) => ({ id: w.b.alert.id }),
  },
  'GET /api/v1/clients/[id]/goal': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
  },
  'PUT /api/v1/clients/[id]/goal': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
    body: () => ({ primaryMetric: 'cpa', primaryTarget: '150000', complete: true }),
  },
  'PATCH /api/v1/clients/[id]': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
    body: () => ({ name: 'Alpha Client 2' }),
  },
  'DELETE /api/v1/clients/[id]': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
  },
};
