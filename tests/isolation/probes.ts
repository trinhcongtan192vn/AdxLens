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
};
