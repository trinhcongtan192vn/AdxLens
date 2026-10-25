import 'server-only';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { Db } from '@adxlens/db';
import { assertEnabled, type FlagKey } from '@adxlens/core/flags';
import { AppError, isAppError, scopedLogger, type Actor, type Logger } from '@adxlens/core/shared';
import {
  assertCan,
  isStaff,
  listWorkspacesForUser,
  resolveActor,
  type Permission,
  type StaffInfo,
} from '@adxlens/core/tenancy';
import type { EmailSender } from '@adxlens/core/notification';
import type { Enqueue } from '@adxlens/jobs';
import { getAuthUser, type AuthUser } from './auth';
import { deps } from './deps';
import { registerWebIncidentSink } from './ops-alerts';
import { API_LIMIT_PER_MINUTE } from './rate-limit';
import type { ObjectStorage } from './storage';

registerWebIncidentSink();

export const WORKSPACE_HEADER = 'x-workspace-id';
export const WORKSPACE_COOKIE = 'ws';

type Auth = 'public' | 'user' | 'workspace' | 'staff';

type BaseCtx = {
  req: Request;
  params: Record<string, string>;
  db: Db;
  enqueue: Enqueue;
  email: EmailSender;
  storage: ObjectStorage;
  log: Logger;
};
export type PublicCtx = BaseCtx;
export type UserCtx = BaseCtx & { user: AuthUser };
export type WorkspaceRouteCtx = UserCtx & { workspaceId: string; actor: Actor };
export type StaffCtx = UserCtx & { staff: StaffInfo };

type CtxFor<A extends Auth> = A extends 'workspace'
  ? WorkspaceRouteCtx
  : A extends 'staff'
    ? StaffCtx
    : A extends 'user'
      ? UserCtx
      : PublicCtx;

export type RouteSpec<A extends Auth, B extends z.ZodType | undefined, Q extends z.ZodType | undefined> = {
  auth: A;
  /** Quyền theo vai trò (chỉ với auth 'workspace'). */
  permission?: Permission;
  /** Cờ tính năng bắt buộc (P1/P2): kiểm phía server trước handler (CLAUDE.md quy tắc 7). */
  flag?: FlagKey;
  body?: B;
  query?: Q;
  handler: (
    ctx: CtxFor<A>,
    input: {
      body: B extends z.ZodType ? z.infer<B> : undefined;
      query: Q extends z.ZodType ? z.infer<Q> : undefined;
    },
  ) => Promise<unknown>;
};

export type RouteHandler = ((req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) & {
  spec: RouteSpec<Auth, z.ZodType | undefined, z.ZodType | undefined>;
};

export function json(data: unknown, init?: number | ResponseInit): Response {
  const status = typeof init === 'number' ? init : (init?.status ?? 200);
  return Response.json(data, typeof init === 'object' ? { ...init, status } : { status });
}

export function errorResponse(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
  return json({ error: { code, message, details } }, status);
}

/** Workspace hiện tại: header X-Workspace-Id (L3 10.1) hoặc cookie `ws`. */
export function requestedWorkspaceId(req: Request): string | null {
  const h = req.headers.get(WORKSPACE_HEADER);
  if (h) return h;
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${WORKSPACE_COOKIE}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

const UUID = z.string().uuid();

/** Tham số đường dẫn dạng uuid; sai định dạng → 404 (không để lỗi Postgres thành 500). */
export function uuidParam(ctx: { params: Record<string, string> }, name: string): string {
  const v = ctx.params[name];
  if (!v || !UUID.safeParse(v).success) throw new AppError('NOT_FOUND', 'Không tìm thấy');
  return v;
}
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Chặn CSRF cho request ghi dùng cookie: Origin phải trùng host (request Bearer không bị chặn). */
function assertSameOrigin(req: Request): void {
  if (!MUTATING.has(req.method) || req.headers.get('authorization')) return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  if (new URL(origin).host !== host) throw new AppError('FORBIDDEN', 'Origin không hợp lệ');
}

async function readBody(req: Request): Promise<unknown> {
  if (!MUTATING.has(req.method)) return undefined;
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('BAD_REQUEST', 'Body phải là JSON');
  }
}

/**
 * Dựng Route Handler theo quy ước CLAUDE.md: route chỉ validate, kiểm quyền, gọi core, enqueue.
 * Handler trả dữ liệu (→ 200 JSON), `Response` (trả nguyên), hoặc null (→ 204).
 */
export function route<
  A extends Auth,
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
>(spec: RouteSpec<A, B, Q>): RouteHandler {
  const fn = async (req: Request, routeCtx: { params: Promise<Record<string, string>> }) => {
    const requestId = randomUUID();
    let log = scopedLogger({
      request_id: requestId,
      method: req.method,
      path: new URL(req.url).pathname,
    });
    try {
      assertSameOrigin(req);
      const { db, enqueue, email, storage, rateLimiter } = deps();
      let remaining: number | null = null;
      const params = (await routeCtx?.params) ?? {};
      const base: BaseCtx = { req, params, db, enqueue, email, storage, log };
      let ctx: PublicCtx | UserCtx | WorkspaceRouteCtx | StaffCtx = base;

      if (spec.auth !== 'public') {
        const user = await getAuthUser(req);
        if (!user) throw new AppError('UNAUTHENTICATED', 'Cần đăng nhập');
        ctx = { ...base, user };
        if (spec.auth === 'staff') {
          const staff = await isStaff(db, user.id);
          if (!staff) throw new AppError('NOT_FOUND', 'Không tìm thấy');
          ctx = { ...ctx, staff };
        }
        if (spec.auth === 'workspace') {
          // Không có header / cookie `ws` (chưa từng chọn workspace, trình duyệt mới): dùng cùng quy tắc với trang
          // (`getPageContext`) — workspace đầu tiên của người dùng — để link điều hướng như Kết nối Meta không lỗi 400.
          const wsId = requestedWorkspaceId(req) ?? (await listWorkspacesForUser(db, user.id))[0]?.id ?? null;
          if (!wsId || !UUID.safeParse(wsId).success) {
            throw new AppError('BAD_REQUEST', 'Thiếu workspace (header X-Workspace-Id)');
          }
          const actor = await resolveActor(db, wsId, user.id);
          if (!actor) throw new AppError('FORBIDDEN', 'Không thuộc workspace này');
          log = log.child({ workspace_id: wsId });
          ctx = { ...ctx, workspaceId: wsId, actor, log };
          if (spec.permission) assertCan(actor, spec.permission);
          if (spec.flag) await assertEnabled({ db, workspaceId: wsId }, spec.flag);
        }
        // L3 10.1: 600 request/phút/workspace (chưa có workspace thì theo user).
        const key = 'workspaceId' in ctx ? `ws:${ctx.workspaceId}` : `u:${user.id}`;
        const rl = await rateLimiter.hit(key, API_LIMIT_PER_MINUTE, 60);
        remaining = rl.remaining;
        if (!rl.allowed) throw new AppError('RATE_LIMITED', 'Quá nhiều request, thử lại sau ít phút');
      }

      const query = spec.query ? spec.query.parse(Object.fromEntries(new URL(req.url).searchParams)) : undefined;
      // Chỉ đọc body JSON khi route khai báo schema; route upload tự đọc multipart.
      const body = spec.body ? spec.body.parse(await readBody(req)) : undefined;

      const result = await spec.handler(ctx as CtxFor<A>, { body, query } as never);
      const res =
        result instanceof Response
          ? result
          : result === null || result === undefined
            ? new Response(null, { status: 204 })
            : json(result);
      if (remaining !== null) res.headers.set('X-RateLimit-Remaining', String(remaining));
      return res;
    } catch (e) {
      if (isAppError(e)) {
        if (e.status >= 500) log.error({ err: e }, 'lỗi nghiệp vụ');
        return errorResponse(e.code, e.message, e.status, e.details);
      }
      if (e instanceof ZodError) {
        return errorResponse('VALIDATION_FAILED', 'Dữ liệu không hợp lệ', 422, {
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      log.error({ err: e }, 'lỗi không mong đợi');
      return errorResponse('INTERNAL', 'Đã có lỗi xảy ra', 500, { request_id: requestId });
    }
  };
  return Object.assign(fn, { spec: spec as RouteHandler['spec'] });
}
