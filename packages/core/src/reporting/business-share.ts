import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { showPoweredBy } from '@adxlens/core/billing';
import { listAdAccounts } from '@adxlens/core/connections';
import {
  addDays,
  AppError,
  localDate,
  notFound,
  SYSTEM_ACTOR,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan, getClient } from '@adxlens/core/tenancy';
import { businessDashboard, type BusinessBlock } from './business';
import { hashSharePassword, shareBlockReasons, type SHARE_EXPIRY_DAYS } from './share';

const { businessLinks } = schema;

export const BUSINESS_LINK_PERIODS = [7, 30] as const;
export type BusinessLink = typeof businessLinks.$inferSelect;

/** ADR-0028: tạo link Business công khai cho một Client (quyền báo cáo + quyền xem Client). */
export async function createBusinessLink(
  ctx: ActorCtx,
  input: {
    clientId: string;
    periodDays: (typeof BUSINESS_LINK_PERIODS)[number];
    expiresInDays?: (typeof SHARE_EXPIRY_DAYS)[number] | null;
    password?: string | null;
  },
  clock: Clock = systemClock,
): Promise<BusinessLink> {
  assertCan(ctx.actor, 'reports.manage');
  const client = await getClient(ctx, input.clientId);
  if (client.archivedAt) throw notFound('Client');
  if (!BUSINESS_LINK_PERIODS.includes(input.periodDays)) throw new AppError('VALIDATION_FAILED', 'Kỳ 7 hoặc 30 ngày');
  const password = input.password?.trim() || null;
  if (password && password.length < 6) throw new AppError('VALIDATION_FAILED', 'Mật khẩu tối thiểu 6 ký tự');
  const [row] = await ctx.db
    .insert(businessLinks)
    .values({
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      token: randomBytes(32).toString('base64url'),
      periodDays: input.periodDays,
      passwordHash: password ? hashSharePassword(password) : null,
      showBadge: await showPoweredBy(ctx, clock),
      expiresAt: input.expiresInDays ? new Date(clock.now().getTime() + input.expiresInDays * 86_400_000) : null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  return row!;
}

/** Link Business của workspace (chỉ Client người dùng được xem). */
export async function listBusinessLinks(ctx: ActorCtx) {
  assertCan(ctx.actor, 'reports.manage');
  const rows = await ctx.db
    .select()
    .from(businessLinks)
    .where(eq(businessLinks.workspaceId, ctx.workspaceId))
    .orderBy(desc(businessLinks.createdAt));
  const visible = new Set<string>();
  for (const id of new Set(rows.map((r) => r.clientId))) {
    if (
      await getClient(ctx, id).then(
        () => true,
        () => false,
      )
    )
      visible.add(id);
  }
  return rows.filter((r) => visible.has(r.clientId));
}

export async function revokeBusinessLink(ctx: ActorCtx, id: string, clock: Clock = systemClock): Promise<void> {
  assertCan(ctx.actor, 'reports.manage');
  const [link] = await ctx.db
    .select()
    .from(businessLinks)
    .where(and(eq(businessLinks.workspaceId, ctx.workspaceId), eq(businessLinks.id, id)));
  if (!link) throw notFound('Link');
  await getClient(ctx, link.clientId); // quyền theo Client
  await ctx.db
    .update(businessLinks)
    .set({ revokedAt: link.revokedAt ?? clock.now() })
    .where(and(eq(businessLinks.workspaceId, ctx.workspaceId), eq(businessLinks.id, id)));
}

export type PublicBusiness =
  | { state: 'not_found' | 'revoked' | 'expired' | 'locked' }
  | { state: 'password'; linkId: string }
  | {
      state: 'ok';
      linkId: string;
      showBadge: boolean;
      clientName: string;
      range: { from: string; to: string };
      blended: BusinessBlock | null;
      currency: string | null;
      accounts: { id: string; name: string; currency: string; block: BusinessBlock }[];
    };

/**
 * ADR-0028: nội dung trang `/b/<token>` trong workspace của link (actor hệ thống): thu hồi / hết hạn / khóa (chưa toàn
 * vẹn, ngắt kết nối, dữ liệu mẫu — như link báo cáo) / cần mật khẩu / số liệu của các tài khoản QC của Client.
 */
export async function publicBusiness(
  ctx: WorkspaceCtx,
  link: BusinessLink,
  opts: { unlocked: boolean; clock?: Clock },
): Promise<PublicBusiness> {
  const now = (opts.clock ?? systemClock).now();
  if (link.revokedAt) return { state: 'revoked' };
  if (link.expiresAt && link.expiresAt <= now) return { state: 'expired' };
  const actx = { ...ctx, actor: SYSTEM_ACTOR };
  const client = await getClient(actx, link.clientId).catch(() => null);
  if (!client || client.archivedAt) return { state: 'not_found' };
  const accounts = (await listAdAccounts(actx)).filter(
    (a) => a.clientId === client.id && a.connectionStatus !== 'revoked',
  );
  if (!accounts.length) return { state: 'locked' };
  // Kỳ tới hôm qua theo múi giờ tài khoản đầu tiên (các tài khoản của một khách thường cùng múi giờ).
  const to = addDays(localDate(now, accounts[0]!.timezone), -1);
  const range = { from: addDays(to, -(link.periodDays - 1)), to };
  const prev = { from: addDays(range.from, -link.periodDays), to: addDays(range.from, -1) };
  if ((await shareBlockReasons(actx, { clientId: client.id, dateFrom: range.from, dateTo: range.to })).blocked) {
    return { state: 'locked' };
  }
  if (link.passwordHash && !opts.unlocked) return { state: 'password', linkId: link.id };
  // Tổng hợp chỉ khi cùng tiền tệ (không cộng VND với USD).
  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const ids = accounts.map((a) => a.id);
  const d = await businessDashboard(actx, currencies.length === 1 ? ids : [], range, prev, ids);
  return {
    state: 'ok',
    linkId: link.id,
    showBadge: link.showBadge,
    clientName: client.name,
    range,
    blended: currencies.length === 1 ? d.blended : null,
    currency: currencies.length === 1 ? currencies[0]! : null,
    accounts: d.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, block: a.block })),
  };
}

export async function recordBusinessView(ctx: WorkspaceCtx, linkId: string, clock: Clock = systemClock) {
  await ctx.db
    .update(businessLinks)
    .set({ viewCount: sql`${businessLinks.viewCount} + 1`, lastViewedAt: clock.now() })
    .where(and(eq(businessLinks.workspaceId, ctx.workspaceId), eq(businessLinks.id, linkId)));
}
