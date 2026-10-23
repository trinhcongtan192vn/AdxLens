import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { dataDeletionEmail, type EmailSender } from '@adxlens/core/notification';
import { AppError, notFound, systemClock, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';

const { metaConnections, deletionRequests, users, workspaces } = schema;

/** Dữ liệu quảng cáo xóa sau 7 ngày (cho phép hoàn tác nhầm), trong cam kết 30 ngày (ADR-0001 A8). */
export const PURGE_DELAY_DAYS = 7;
export const DELETION_COMMITMENT_DAYS = 30;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã xác nhận dạng `XD-XXXXXXXX` (khớp trang tra cứu M05). */
export function newDeletionCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `XD-${s}`;
}

export type DeletionDeps = { enqueue: Enqueue; email?: EmailSender; appUrl?: string; clock?: Clock };

function fmtDate(d: Date, locale: 'vi' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d);
}

async function notify(
  ctx: WorkspaceCtx,
  userId: string | null,
  input: { code: string; phase: 'scheduled' | 'done'; purgeAfter: Date },
  deps: { email?: EmailSender; appUrl?: string },
) {
  if (!userId || !deps.email) return;
  const [u] = await ctx.db
    .select({ email: users.email, locale: users.locale, ws: workspaces.name })
    .from(users)
    .innerJoin(workspaces, eq(workspaces.id, ctx.workspaceId))
    .where(eq(users.id, userId));
  if (!u) return;
  const locale = u.locale === 'en' ? 'en' : 'vi';
  await deps.email.send(
    dataDeletionEmail({
      locale,
      to: u.email,
      workspaceName: u.ws,
      code: input.code,
      phase: input.phase,
      purgeBy: fmtDate(input.purgeAfter, locale),
      statusLink: `${deps.appUrl ?? ''}/data-deletion?code=${input.code}`,
    }),
  );
}

/**
 * Thu hồi kết nối trong một workspace: xóa token ngay (ghi đè rỗng, L3 5.5), trạng thái `revoked`,
 * tạo yêu cầu xóa và hẹn job purge sau 7 ngày. Đã có yêu cầu đang chờ → trả lại yêu cầu đó.
 * Không gọi API ghi của Meta (CLAUDE.md quy tắc 3); người dùng có thể gỡ ứng dụng trong cài đặt Facebook.
 */
export async function revokeConnection(
  ctx: WorkspaceCtx,
  connectionId: string,
  input: { source: 'user' | 'meta_callback'; requestedBy: string | null; code?: string },
  deps: DeletionDeps,
): Promise<{ code: string; purgeAfter: Date; created: boolean }> {
  const clock = deps.clock ?? systemClock;
  const [conn] = await ctx.db
    .select({ id: metaConnections.id, metaUserId: metaConnections.metaUserId, status: metaConnections.status })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  if (!conn) throw notFound('Kết nối');
  const [pending] = await ctx.db
    .select()
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.workspaceId, ctx.workspaceId),
        eq(deletionRequests.connectionId, connectionId),
        inArray(deletionRequests.status, ['pending', 'in_progress']),
      ),
    )
    .limit(1);
  if (pending && conn.status === 'revoked') {
    return { code: pending.code, purgeAfter: pending.purgeAfter, created: false };
  }

  await ctx.db
    .update(metaConnections)
    .set({ tokenCiphertext: Buffer.alloc(0), status: 'revoked' })
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  const purgeAfter = new Date(clock.now().getTime() + PURGE_DELAY_DAYS * 86_400_000);
  const code = input.code ?? newDeletionCode();
  await ctx.db.insert(deletionRequests).values({
    workspaceId: ctx.workspaceId,
    connectionId,
    code,
    source: input.source,
    metaUserId: conn.metaUserId,
    requestedBy: input.requestedBy,
    purgeAfter,
  });
  await deps.enqueue(
    'maintenance:purge_connection_data',
    { workspaceId: ctx.workspaceId, connectionId },
    { delayMs: PURGE_DELAY_DAYS * 86_400_000 },
  );
  await notify(ctx, input.requestedBy, { code, phase: 'scheduled', purgeAfter }, deps);
  return { code, purgeAfter, created: true };
}

/** S07: người dùng (owner/manager) ngắt kết nối. */
export async function disconnectConnection(ctx: ActorCtx, connectionId: string, deps: DeletionDeps) {
  assertCan(ctx.actor, 'connections.manage');
  return revokeConnection(ctx, connectionId, { source: 'user', requestedBy: ctx.actor.userId }, deps);
}

/**
 * Job `maintenance:purge_connection_data`: xóa kết nối và mọi dữ liệu quảng cáo (cascade: tài khoản QC,
 * insight, cấu trúc, lần đồng bộ, đối chiếu). Kết nối lại trước hạn (status active) → hủy yêu cầu.
 */
export async function purgeConnectionData(
  ctx: WorkspaceCtx,
  connectionId: string,
  deps: { email?: EmailSender; appUrl?: string; clock?: Clock } = {},
): Promise<'done' | 'cancelled' | 'not_due' | 'nothing'> {
  const clock = deps.clock ?? systemClock;
  const requests = await ctx.db
    .select()
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.workspaceId, ctx.workspaceId),
        eq(deletionRequests.connectionId, connectionId),
        inArray(deletionRequests.status, ['pending', 'in_progress']),
      ),
    )
    .orderBy(desc(deletionRequests.createdAt));
  if (!requests.length) return 'nothing';
  const [conn] = await ctx.db
    .select({ status: metaConnections.status })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  const ids = requests.map((r) => r.id);
  const setStatus = (status: 'in_progress' | 'done' | 'cancelled') =>
    ctx.db
      .update(deletionRequests)
      .set({ status, completedAt: status === 'in_progress' ? null : clock.now() })
      .where(and(eq(deletionRequests.workspaceId, ctx.workspaceId), inArray(deletionRequests.id, ids)));

  if (conn && conn.status === 'active') {
    await setStatus('cancelled');
    return 'cancelled';
  }
  if (requests.some((r) => r.purgeAfter > clock.now())) return 'not_due';
  await setStatus('in_progress');
  await ctx.db
    .delete(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  await setStatus('done');
  for (const r of requests) {
    await notify(ctx, r.requestedBy, { code: r.code, phase: 'done', purgeAfter: r.purgeAfter }, deps);
  }
  return 'done';
}

/** Yêu cầu xóa của workspace (S02/S07: đang xóa, đã xóa). */
export async function listDeletionRequests(ctx: WorkspaceCtx) {
  return ctx.db
    .select({
      code: deletionRequests.code,
      connectionId: deletionRequests.connectionId,
      status: deletionRequests.status,
      purgeAfter: deletionRequests.purgeAfter,
      completedAt: deletionRequests.completedAt,
      createdAt: deletionRequests.createdAt,
    })
    .from(deletionRequests)
    .where(eq(deletionRequests.workspaceId, ctx.workspaceId))
    .orderBy(desc(deletionRequests.createdAt))
    .limit(20);
}

/**
 * Giải mã `signed_request` của Meta (deauthorize / data deletion callback): HMAC-SHA256 bằng app secret,
 * so sánh hằng thời gian. Sai chữ ký → lỗi, không xử lý.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): { userId: string } {
  const [sig, payload] = signedRequest.split('.', 2);
  if (!sig || !payload) throw new AppError('BAD_REQUEST', 'signed_request không hợp lệ');
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError('FORBIDDEN', 'Chữ ký không hợp lệ');
  }
  let data: { algorithm?: string; user_id?: string };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof data;
  } catch {
    throw new AppError('BAD_REQUEST', 'signed_request không hợp lệ');
  }
  if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || !data.user_id) {
    throw new AppError('BAD_REQUEST', 'signed_request không hợp lệ');
  }
  return { userId: String(data.user_id) };
}

/** Dựng signed_request (dùng cho test và mock). */
export function signRequest(payload: Record<string, unknown>, appSecret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', appSecret).update(body).digest('base64url');
  return `${sig}.${body}`;
}
