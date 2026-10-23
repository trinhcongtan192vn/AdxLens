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
};
