import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { notFound, systemClock, type Clock, type Role, type WorkspaceCtx } from '@adxlens/core/shared';
import type { EmailSender } from './email';
import { alertEmail } from './templates/alerts';

const { notifications, notificationSettings, memberships, users, workspaces } = schema;

/**
 * Loại thông báo (PRD P0-25). `mandatory`: sự cố số liệu, token, thanh toán — luôn bật cả trong app và
 * email, người dùng không tắt được (ST05). Mặc định của loại thường ghi ở đây.
 */
export const NOTIFICATION_KINDS = {
  sync_done: { mandatory: false, inApp: true, email: false },
  reconciliation_warning: { mandatory: true, inApp: true, email: true },
  token_expiring: { mandatory: true, inApp: true, email: true },
  token_expired: { mandatory: true, inApp: true, email: true },
  report_viewed: { mandatory: false, inApp: true, email: false },
  report_sent: { mandatory: false, inApp: true, email: false },
  report_postponed: { mandatory: true, inApp: true, email: true },
  report_needs_approval: { mandatory: false, inApp: true, email: true },
  weekly_digest: { mandatory: false, inApp: false, email: true },
  billing_failed: { mandatory: true, inApp: true, email: true },
  billing_renewal: { mandatory: true, inApp: true, email: true },
  action_failed: { mandatory: true, inApp: true, email: true },
  weekly_actions: { mandatory: false, inApp: true, email: true },
  action_assigned: { mandatory: false, inApp: true, email: false },
  action_executed: { mandatory: false, inApp: true, email: false },
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
export const NOTIFICATION_KIND_LIST = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

export type Recipients = {
  userIds?: string[];
  /** Thành viên có vai trò này (owner, manager, buyer). */
  roles?: Role[];
  /** Chỉ người được xem Client này (owner, manager không giới hạn, người được gán). */
  clientId?: string | null;
};

async function resolveRecipients(ctx: WorkspaceCtx, r: Recipients): Promise<string[]> {
  const members = await ctx.db
    .select({ userId: memberships.userId, role: memberships.role, clientAccess: memberships.clientAccess })
    .from(memberships)
    .where(eq(memberships.workspaceId, ctx.workspaceId));
  const ids = new Set<string>();
  for (const m of members) {
    const byRole = r.roles?.includes(m.role) ?? false;
    const byId = r.userIds?.includes(m.userId) ?? false;
    if (!byRole && !byId) continue;
    if (r.clientId && m.role !== 'owner' && m.clientAccess.length > 0 && !m.clientAccess.includes(r.clientId)) continue;
    if (r.clientId && m.role === 'buyer' && m.clientAccess.length === 0) continue;
    ids.add(m.userId);
  }
  return [...ids];
}

/** Cài đặt hiệu lực của một người cho một loại (loại bắt buộc luôn bật). */
export async function effectiveSettings(ctx: WorkspaceCtx, userIds: string[], kind: NotificationKind) {
  const def = NOTIFICATION_KINDS[kind];
  const rows = userIds.length
    ? await ctx.db
        .select()
        .from(notificationSettings)
        .where(
          and(
            eq(notificationSettings.workspaceId, ctx.workspaceId),
            inArray(notificationSettings.userId, userIds),
            eq(notificationSettings.kind, kind),
          ),
        )
    : [];
  return new Map(
    userIds.map((u) => {
      const row = rows.find((x) => x.userId === u);
      return [
        u,
        def.mandatory
          ? { inApp: true, email: true }
          : { inApp: row?.inApp ?? def.inApp, email: row?.email ?? def.email },
      ];
    }),
  );
}

/**
 * Gửi thông báo cho người nhận trong workspace: tạo dòng trong app theo cài đặt, enqueue email
 * `notify:send_email` khi bật email. `dedupeKey` → cùng sự kiện không gửi lại cho cùng người.
 * `email: false` buộc không gửi email (ví dụ playbook đã tự gửi).
 */
export async function notify(
  ctx: WorkspaceCtx,
  input: {
    kind: NotificationKind;
    recipients: Recipients;
    params?: Record<string, string | number>;
    link?: string | null;
    dedupeKey?: string | null;
    email?: false;
    /** Luôn lưu dòng (đã đọc nếu không bật trong app) — để chống trùng cho email gửi riêng (digest). */
    forceRecord?: boolean;
  },
  deps: { enqueue?: Enqueue } = {},
): Promise<{ created: number; emailed: number }> {
  const userIds = await resolveRecipients(ctx, input.recipients);
  const settings = await effectiveSettings(ctx, userIds, input.kind);
  let created = 0;
  let emailed = 0;
  for (const userId of userIds) {
    const s = settings.get(userId)!;
    const wantEmail = s.email && input.email !== false && Boolean(deps.enqueue);
    if (!s.inApp && !wantEmail && !input.forceRecord) continue;
    const [row] = await ctx.db
      .insert(notifications)
      .values({
        workspaceId: ctx.workspaceId,
        userId,
        kind: input.kind,
        params: input.params ?? {},
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
        // Không bật trong app nhưng có email: vẫn lưu (đánh dấu đã đọc) để email có nội dung gốc.
        readAt: s.inApp ? null : new Date(),
        emailStatus: wantEmail ? 'queued' : 'none',
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!row) continue;
    created++;
    if (wantEmail) {
      await deps.enqueue!('notify:send_email', { workspaceId: ctx.workspaceId, notificationId: row.id });
      emailed++;
    }
  }
  return { created, emailed };
}

/** Job `notify:send_email`: dựng email theo loại + locale người nhận, gửi, ghi trạng thái. */
export async function sendNotificationEmail(
  ctx: WorkspaceCtx,
  notificationId: string,
  deps: { email: EmailSender; appUrl: string },
): Promise<'sent' | 'skipped'> {
  const [n] = await ctx.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.workspaceId, ctx.workspaceId), eq(notifications.id, notificationId)));
  if (!n || n.emailStatus === 'sent') return 'skipped';
  const [u] = await ctx.db
    .select({ email: users.email, locale: users.locale, ws: workspaces.name })
    .from(users)
    .innerJoin(workspaces, eq(workspaces.id, ctx.workspaceId))
    .where(eq(users.id, n.userId));
  if (!u) return 'skipped';
  try {
    await deps.email.send(
      alertEmail({
        kind: n.kind as NotificationKind,
        locale: u.locale === 'en' ? 'en' : 'vi',
        to: u.email,
        workspaceName: u.ws,
        params: n.params,
        link: n.link ? `${deps.appUrl}${n.link}` : deps.appUrl,
      }),
    );
  } catch (e) {
    await ctx.db
      .update(notifications)
      .set({ emailStatus: 'failed' })
      .where(and(eq(notifications.workspaceId, ctx.workspaceId), eq(notifications.id, n.id)));
    throw e;
  }
  await ctx.db
    .update(notifications)
    .set({ emailStatus: 'sent' })
    .where(and(eq(notifications.workspaceId, ctx.workspaceId), eq(notifications.id, n.id)));
  return 'sent';
}

/** X05: thông báo của người dùng (mới nhất trước). */
export async function listNotifications(ctx: WorkspaceCtx, userId: string, opts: { limit?: number } = {}) {
  return ctx.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.workspaceId, ctx.workspaceId), eq(notifications.userId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 50);
}

export async function unreadCount(ctx: WorkspaceCtx, userId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, ctx.workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  return r?.n ?? 0;
}

/** Đánh dấu đã đọc một thông báo (của chính người dùng) hoặc tất cả. */
export async function markRead(ctx: WorkspaceCtx, userId: string, notificationId?: string, clock: Clock = systemClock) {
  const rows = await ctx.db
    .update(notifications)
    .set({ readAt: clock.now() })
    .where(
      and(
        eq(notifications.workspaceId, ctx.workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        notificationId ? eq(notifications.id, notificationId) : undefined,
      ),
    )
    .returning({ id: notifications.id });
  if (notificationId && !rows.length) {
    const [exists] = await ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, ctx.workspaceId),
          eq(notifications.userId, userId),
          eq(notifications.id, notificationId),
        ),
      );
    if (!exists) throw notFound('Thông báo');
  }
  return rows.length;
}

/** ST05: cài đặt hiệu lực của người dùng cho mọi loại. */
export async function getNotificationSettings(ctx: WorkspaceCtx, userId: string) {
  const rows = await ctx.db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.workspaceId, ctx.workspaceId), eq(notificationSettings.userId, userId)));
  return NOTIFICATION_KIND_LIST.map((kind) => {
    const def = NOTIFICATION_KINDS[kind];
    const row = rows.find((r) => r.kind === kind);
    return {
      kind,
      mandatory: def.mandatory,
      inApp: def.mandatory ? true : (row?.inApp ?? def.inApp),
      email: def.mandatory ? true : (row?.email ?? def.email),
    };
  });
}

/** ST05: lưu cài đặt; loại bắt buộc bỏ qua (luôn bật). */
export async function updateNotificationSettings(
  ctx: WorkspaceCtx,
  userId: string,
  items: { kind: NotificationKind; inApp: boolean; email: boolean }[],
) {
  for (const it of items) {
    if (!(it.kind in NOTIFICATION_KINDS) || NOTIFICATION_KINDS[it.kind].mandatory) continue;
    await ctx.db
      .insert(notificationSettings)
      .values({ workspaceId: ctx.workspaceId, userId, kind: it.kind, inApp: it.inApp, email: it.email })
      .onConflictDoUpdate({
        target: [notificationSettings.workspaceId, notificationSettings.userId, notificationSettings.kind],
        set: { inApp: it.inApp, email: it.email },
      });
  }
  return getNotificationSettings(ctx, userId);
}
