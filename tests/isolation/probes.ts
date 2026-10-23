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
  'GET /api/v1/clients': { kind: 'workspace' },
  'POST /api/v1/clients': { kind: 'workspace', body: () => ({ name: 'Client mới' }) },
  'GET /api/v1/clients/[id]': {
    kind: 'workspace',
    params: (w) => ({ id: w.a.client.id }),
    crossParams: (w) => ({ id: w.b.client.id }),
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
