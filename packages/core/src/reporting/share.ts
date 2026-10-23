import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import {
  AppError,
  notFound,
  SYSTEM_ACTOR,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { getReport, isBlocked, reportIntegrity } from './report';

const { shareLinks, workspaces, adAccounts, metaConnections } = schema;

/** Hạn tùy chọn của link (PRD P0-14). null = không hết hạn. */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;

export function hashSharePassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifySharePassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const got = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(got, expected);
}

/** Lý do khóa chia sẻ hiện tại (kiểm lại lúc chia sẻ/xem — ADR-0007, P0-22, P0-23). */
export async function shareBlockReasons(ctx: ActorCtx, report: { clientId: string; dateFrom: string; dateTo: string }) {
  const integrity = await reportIntegrity(ctx, report.clientId, { from: report.dateFrom, to: report.dateTo });
  const [revoked] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        eq(adAccounts.workspaceId, ctx.workspaceId),
        eq(adAccounts.clientId, report.clientId),
        eq(metaConnections.status, 'revoked'),
      ),
    );
  return {
    integrity,
    connectionRevoked: (revoked?.n ?? 0) > 0,
    blocked: isBlocked(integrity) || (revoked?.n ?? 0) > 0,
  };
}

/** R04: tạo link công khai. Chưa toàn vẹn → 422 REPORT_BLOCKED (DB trigger chặn thêm lớp nữa). */
export async function createShareLink(
  ctx: ActorCtx,
  reportId: string,
  input: { expiresInDays?: (typeof SHARE_EXPIRY_DAYS)[number] | null; password?: string | null },
  clock: Clock = systemClock,
) {
  assertCan(ctx.actor, 'reports.manage');
  const report = await getReport(ctx, reportId);
  if (report.status !== 'ready') throw new AppError('CONFLICT', 'Báo cáo chưa dựng xong');
  const block = await shareBlockReasons(ctx, report);
  if (block.blocked) {
    throw new AppError('REPORT_BLOCKED', 'Báo cáo chưa chia sẻ được', {
      unconfirmed_accounts: block.integrity.unconfirmedAccounts,
      warning_dates: block.integrity.warningDates,
      connection_revoked: block.connectionRevoked,
    });
  }
  const password = input.password?.trim() || null;
  if (password && password.length < 6) throw new AppError('VALIDATION_FAILED', 'Mật khẩu tối thiểu 6 ký tự');
  const [ws] = await ctx.db
    .select({ badgeRemoved: workspaces.badgeRemoved })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  const token = randomBytes(32).toString('base64url');
  try {
    const [link] = await ctx.db
      .insert(shareLinks)
      .values({
        workspaceId: ctx.workspaceId,
        reportId: report.id,
        token,
        passwordHash: password ? hashSharePassword(password) : null,
        showBadge: !ws?.badgeRemoved,
        expiresAt: input.expiresInDays ? new Date(clock.now().getTime() + input.expiresInDays * 86_400_000) : null,
        createdBy: ctx.actor.userId,
      })
      .returning();
    return link!;
  } catch (e) {
    // Lỗi từ trigger DB (drizzle bọc lỗi Postgres trong `cause`).
    const msg = `${(e as Error).message} ${(e as { cause?: Error }).cause?.message ?? ''}`;
    if (msg.includes('REPORT_BLOCKED')) {
      throw new AppError('REPORT_BLOCKED', 'Báo cáo chưa chia sẻ được');
    }
    throw e;
  }
}

export async function listShareLinks(ctx: ActorCtx, reportId: string) {
  const report = await getReport(ctx, reportId);
  return ctx.db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.workspaceId, ctx.workspaceId), eq(shareLinks.reportId, report.id)))
    .orderBy(desc(shareLinks.createdAt));
}

/** Thu hồi link (link chết ngay). */
export async function revokeShareLink(ctx: ActorCtx, linkId: string, clock: Clock = systemClock) {
  assertCan(ctx.actor, 'reports.manage');
  const [link] = await ctx.db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.workspaceId, ctx.workspaceId), eq(shareLinks.id, linkId)));
  if (!link) throw notFound('Link chia sẻ');
  await getReport(ctx, link.reportId); // quyền theo Client
  await ctx.db
    .update(shareLinks)
    .set({ revokedAt: link.revokedAt ?? clock.now() })
    .where(and(eq(shareLinks.workspaceId, ctx.workspaceId), eq(shareLinks.id, link.id)));
}

export type PublicShareState =
  | { state: 'not_found' }
  | { state: 'revoked' | 'expired' | 'locked' }
  | { state: 'password'; linkId: string }
  | { state: 'ok'; linkId: string; workspaceId: string; reportId: string; showBadge: boolean };

/**
 * Trạng thái link công khai trong workspace của nó (R06): thu hồi / hết hạn / khóa (chưa toàn vẹn nữa hoặc
 * kết nối đã ngắt — P0-22, P0-23) / cần mật khẩu / xem được. `unlocked` = đã nhập đúng mật khẩu.
 */
export async function publicShareState(
  ctx: WorkspaceCtx,
  link: typeof shareLinks.$inferSelect,
  opts: { unlocked: boolean; clock?: Clock },
): Promise<PublicShareState> {
  const now = (opts.clock ?? systemClock).now();
  if (link.revokedAt) return { state: 'revoked' };
  if (link.expiresAt && link.expiresAt <= now) return { state: 'expired' };
  // Người xem công khai: chỉ đọc trong workspace của link (actor hệ thống).
  const actorCtx = { ...ctx, actor: SYSTEM_ACTOR };
  const report = await getReport(actorCtx, link.reportId).catch(() => null);
  if (!report || report.status !== 'ready') return { state: 'not_found' };
  if ((await shareBlockReasons(actorCtx, report)).blocked) return { state: 'locked' };
  if (link.passwordHash && !opts.unlocked) return { state: 'password', linkId: link.id };
  return {
    state: 'ok',
    linkId: link.id,
    workspaceId: link.workspaceId,
    reportId: link.reportId,
    showBadge: link.showBadge,
  };
}

/** Ghi lượt xem (cho thông báo "báo cáo đã được khách mở", 023). */
export async function recordShareView(ctx: WorkspaceCtx, linkId: string, clock: Clock = systemClock) {
  await ctx.db
    .update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: clock.now() })
    .where(and(eq(shareLinks.workspaceId, ctx.workspaceId), eq(shareLinks.id, linkId)));
}
