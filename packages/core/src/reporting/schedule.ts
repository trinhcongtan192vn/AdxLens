import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { notify, scheduledReportEmail, type EmailSender } from '@adxlens/core/notification';
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
import { assertCan, getClient, resolveActor } from '@adxlens/core/tenancy';
import { buildReport, createReport } from './report';
import { createShareLink, shareBlockReasons } from './share';
import type { LlmClient } from './summary';

const { reportSchedules, reportDeliveries, reports, workspaces } = schema;

export type ScheduleInput = {
  clientId: string;
  cadence: 'weekly' | 'monthly';
  weekday?: number | null;
  monthDay?: number | null;
  sendHour: number;
  timezone: string;
  mode: 'auto' | 'approval';
  delivery: 'link' | 'pdf';
  locale?: 'vi' | 'en' | null;
  recipients: string[];
  enabled?: boolean;
};

/** Link gửi khách theo lịch có hạn 30 ngày (PRD P0-14 hạn tùy chọn). */
export const SCHEDULE_LINK_DAYS = 30;
export const MAX_RECIPIENTS = 10;

function validate(input: ScheduleInput) {
  if (input.cadence === 'weekly' && !(input.weekday && input.weekday >= 1 && input.weekday <= 7)) {
    throw new AppError('VALIDATION_FAILED', 'Chọn thứ trong tuần');
  }
  if (input.cadence === 'monthly' && !(input.monthDay && input.monthDay >= 1 && input.monthDay <= 28)) {
    throw new AppError('VALIDATION_FAILED', 'Chọn ngày 1–28');
  }
  if (!(input.sendHour >= 0 && input.sendHour <= 23)) throw new AppError('VALIDATION_FAILED', 'Giờ gửi không hợp lệ');
  const emails = [...new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length || emails.length > MAX_RECIPIENTS || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    throw new AppError('VALIDATION_FAILED', 'Danh sách email người nhận không hợp lệ', { max: MAX_RECIPIENTS });
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timezone });
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Múi giờ không hợp lệ');
  }
  return emails;
}

/** R05: tạo lịch gửi. */
export async function createSchedule(ctx: ActorCtx, input: ScheduleInput) {
  assertCan(ctx.actor, 'reports.manage');
  await getClient(ctx, input.clientId);
  const recipients = validate(input);
  const [row] = await ctx.db
    .insert(reportSchedules)
    .values({
      workspaceId: ctx.workspaceId,
      clientId: input.clientId,
      cadence: input.cadence,
      weekday: input.cadence === 'weekly' ? input.weekday! : null,
      monthDay: input.cadence === 'monthly' ? input.monthDay! : null,
      sendHour: input.sendHour,
      timezone: input.timezone,
      mode: input.mode,
      delivery: input.delivery,
      locale: input.locale ?? null,
      recipients,
      enabled: input.enabled ?? true,
      createdBy: ctx.actor.userId,
    })
    .returning();
  return row!;
}

async function getSchedule(ctx: WorkspaceCtx, id: string) {
  const [s] = await ctx.db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.workspaceId, ctx.workspaceId), eq(reportSchedules.id, id)));
  if (!s) throw notFound('Lịch gửi');
  return s;
}

export async function updateSchedule(ctx: ActorCtx, id: string, input: ScheduleInput) {
  assertCan(ctx.actor, 'reports.manage');
  const s = await getSchedule(ctx, id);
  await getClient(ctx, s.clientId);
  const recipients = validate({ ...input, clientId: s.clientId });
  const [row] = await ctx.db
    .update(reportSchedules)
    .set({
      cadence: input.cadence,
      weekday: input.cadence === 'weekly' ? input.weekday! : null,
      monthDay: input.cadence === 'monthly' ? input.monthDay! : null,
      sendHour: input.sendHour,
      timezone: input.timezone,
      mode: input.mode,
      delivery: input.delivery,
      locale: input.locale ?? null,
      recipients,
      enabled: input.enabled ?? s.enabled,
    })
    .where(and(eq(reportSchedules.workspaceId, ctx.workspaceId), eq(reportSchedules.id, s.id)))
    .returning();
  return row!;
}

export async function deleteSchedule(ctx: ActorCtx, id: string) {
  assertCan(ctx.actor, 'reports.manage');
  const s = await getSchedule(ctx, id);
  await getClient(ctx, s.clientId);
  await ctx.db
    .delete(reportSchedules)
    .where(and(eq(reportSchedules.workspaceId, ctx.workspaceId), eq(reportSchedules.id, s.id)));
}

/** R05: lịch + lần gửi gần nhất (buyer chỉ thấy Client được gán). */
export async function listSchedules(ctx: ActorCtx, opts: { clientId?: string } = {}) {
  const rows = await ctx.db
    .select({ s: reportSchedules, clientName: schema.clients.name })
    .from(reportSchedules)
    .innerJoin(schema.clients, eq(schema.clients.id, reportSchedules.clientId))
    .where(
      and(
        eq(reportSchedules.workspaceId, ctx.workspaceId),
        opts.clientId ? eq(reportSchedules.clientId, opts.clientId) : undefined,
      ),
    )
    .orderBy(desc(reportSchedules.createdAt));
  const full = ctx.actor.role === 'owner' || (ctx.actor.role === 'manager' && ctx.actor.clientAccess.length === 0);
  const visible = full ? rows : rows.filter((r) => ctx.actor.clientAccess.includes(r.s.clientId));
  const ids = visible.map((r) => r.s.id);
  const deliveries = ids.length
    ? await ctx.db
        .select()
        .from(reportDeliveries)
        .where(and(eq(reportDeliveries.workspaceId, ctx.workspaceId), inArray(reportDeliveries.scheduleId, ids)))
        .orderBy(desc(reportDeliveries.createdAt))
    : [];
  return visible.map((r) => ({
    ...r.s,
    clientName: r.clientName,
    deliveries: deliveries.filter((d) => d.scheduleId === r.s.id).slice(0, 10),
  }));
}

// ---------- Kỳ và thời điểm chạy ----------

const isoWeekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

function isoWeekKey(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3); // thứ Năm cùng tuần quyết định năm ISO
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now)) % 24;
}

/** Kỳ báo cáo của lần chạy: tuần trước (thứ Hai–Chủ nhật) hoặc tháng trước, theo múi giờ của lịch. */
export function schedulePeriod(
  s: { cadence: 'weekly' | 'monthly'; timezone: string },
  now: Date,
): { key: string; from: string; to: string } {
  const today = localDate(now, s.timezone);
  if (s.cadence === 'weekly') {
    const thisMonday = addDays(today, -(isoWeekday(today) - 1));
    const from = addDays(thisMonday, -7);
    return { key: isoWeekKey(from), from, to: addDays(from, 6) };
  }
  const first = `${today.slice(0, 7)}-01`;
  const to = addDays(first, -1);
  return { key: to.slice(0, 7), from: `${to.slice(0, 7)}-01`, to };
}

/** Lịch có đến giờ chạy không (giờ địa phương của lịch, đúng thứ/ngày, đúng giờ). */
export function isDue(
  s: {
    cadence: 'weekly' | 'monthly';
    weekday: number | null;
    monthDay: number | null;
    sendHour: number;
    timezone: string;
    enabled: boolean;
  },
  now: Date,
): boolean {
  if (!s.enabled || localHour(now, s.timezone) !== s.sendHour) return false;
  const today = localDate(now, s.timezone);
  return s.cadence === 'weekly' ? isoWeekday(today) === s.weekday : Number(today.slice(8, 10)) === s.monthDay;
}

export function periodFromKey(key: string): { from: string; to: string } {
  const w = /^(\d{4})-W(\d{2})$/.exec(key);
  if (w) {
    const jan4 = new Date(Date.UTC(Number(w[1]), 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (Number(w[2]) - 1) * 7);
    const from = monday.toISOString().slice(0, 10);
    return { from, to: addDays(from, 6) };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new AppError('VALIDATION_FAILED', 'Kỳ không hợp lệ');
  const from = `${key}-01`;
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

// ---------- Chạy lịch ----------

export type RunDeps = {
  email: EmailSender;
  publicReportUrl: string;
  enqueue?: Enqueue;
  llm?: LlmClient | null;
  /** Render PDF A4 của báo cáo (worker). */
  renderPdf?: (reportId: string) => Promise<Uint8Array>;
  clock?: Clock;
};

async function upsertDelivery(
  ctx: WorkspaceCtx,
  v: {
    scheduleId: string;
    period: string;
    reportId: string | null;
    status: (typeof schema.DELIVERY_STATUSES)[number];
    reason?: string | null;
    sentAt?: Date | null;
  },
) {
  await ctx.db
    .insert(reportDeliveries)
    .values({ workspaceId: ctx.workspaceId, ...v, reason: v.reason ?? null, sentAt: v.sentAt ?? null })
    .onConflictDoUpdate({
      target: [reportDeliveries.scheduleId, reportDeliveries.period],
      set: { reportId: v.reportId, status: v.status, reason: v.reason ?? null, sentAt: v.sentAt ?? null },
    });
}

function periodLabel(locale: 'vi' | 'en', p: { from: string; to: string }) {
  const f = (iso: string) =>
    locale === 'en' ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${f(p.from)} – ${f(p.to)}/${p.to.slice(0, 4)}`;
}

/** Gửi báo cáo đã dựng cho người nhận của lịch: link công khai 30 ngày (+ PDF khi chọn). */
async function deliver(
  ctx: ActorCtx,
  sched: typeof reportSchedules.$inferSelect,
  period: string,
  reportId: string,
  deps: RunDeps,
): Promise<'sent'> {
  const clock = deps.clock ?? systemClock;
  const link = await createShareLink(ctx, reportId, { expiresInDays: SCHEDULE_LINK_DAYS }, clock);
  const [r] = await ctx.db
    .select()
    .from(reports)
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, reportId)));
  const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  const client = await getClient({ ...ctx, actor: SYSTEM_ACTOR }, sched.clientId);
  const locale = r!.locale === 'en' ? 'en' : 'vi';
  const pdf = sched.delivery === 'pdf' && deps.renderPdf ? await deps.renderPdf(reportId) : null;
  const url = `${deps.publicReportUrl.replace(/\/$/, '')}/${link.token}`;
  for (const to of sched.recipients) {
    await deps.email.send(
      scheduledReportEmail({
        locale,
        to,
        agencyName: ws?.brand.display_name || ws?.name || 'AdxLens',
        clientName: client.name,
        periodLabel: periodLabel(locale, { from: r!.dateFrom, to: r!.dateTo }),
        link: url,
        pdf: pdf ? { filename: `${client.name}-${period}.pdf`, content: pdf } : null,
        replyTo: ws?.reportFromEmail ?? null,
      }),
    );
  }
  await upsertDelivery(ctx, { scheduleId: sched.id, period, reportId, status: 'sent', sentAt: clock.now() });
  await notify(
    ctx,
    {
      kind: 'report_sent',
      recipients: { userIds: [sched.createdBy] },
      params: { client: client.name, report: period },
      link: `/reports/${reportId}`,
      dedupeKey: `sent:${sched.id}:${period}`,
    },
    { enqueue: deps.enqueue },
  );
  return 'sent';
}

/**
 * Job `notify:scheduled_report` (PRD P0-17, P0-24): dựng báo cáo kỳ, kiểm toàn vẹn (chưa xác nhận gán / lệch
 * > 1% / kết nối đã ngắt → **hoãn** và báo account manager kèm lý do), chế độ cần duyệt → chờ duyệt, tự động
 * → gửi. Đã gửi / đang chờ duyệt cho kỳ này → bỏ qua (idempotent). Đã được duyệt → gửi.
 */
export async function runSchedule(
  ctx: WorkspaceCtx,
  input: { scheduleId: string; period: string },
  deps: RunDeps,
): Promise<'sent' | 'postponed' | 'pending_approval' | 'skipped' | 'disabled'> {
  const clock = deps.clock ?? systemClock;
  const sched = await getSchedule(ctx, input.scheduleId);
  if (!sched.enabled) return 'disabled';
  const [existing] = await ctx.db
    .select()
    .from(reportDeliveries)
    .where(
      and(
        eq(reportDeliveries.workspaceId, ctx.workspaceId),
        eq(reportDeliveries.scheduleId, sched.id),
        eq(reportDeliveries.period, input.period),
      ),
    );
  if (existing?.status === 'sent' || existing?.status === 'pending_approval') return 'skipped';
  // Báo cáo ghi người tạo là người lập lịch (nếu còn là owner/manager), không thì actor hệ thống.
  const creator = await resolveActor(ctx.db, ctx.workspaceId, sched.createdBy);
  const builder = creator && creator.role !== 'buyer' ? creator : SYSTEM_ACTOR;

  let reportId = existing?.status === 'approved' ? existing.reportId : null;
  if (!reportId) {
    const range = periodFromKey(input.period);
    const { id } = await createReport(
      { ...ctx, actor: builder },
      {
        clientId: sched.clientId,
        kind: 'periodic',
        from: range.from,
        to: range.to,
        locale: (sched.locale as 'vi' | 'en' | null) ?? undefined,
      },
      { enqueue: async () => {} }, // dựng ngay trong job này
    );
    await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, id, clock, { llm: deps.llm });
    reportId = id;
  }
  const [report] = await ctx.db
    .select()
    .from(reports)
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, reportId)));
  const client = await getClient({ ...ctx, actor: SYSTEM_ACTOR }, sched.clientId);
  const block = report?.status === 'ready' ? await shareBlockReasons({ ...ctx, actor: SYSTEM_ACTOR }, report) : null;
  if (!report || report.status !== 'ready' || block?.blocked) {
    const reason =
      !report || report.status !== 'ready'
        ? 'build_failed'
        : block!.connectionRevoked
          ? 'connection_revoked'
          : block!.integrity.unconfirmedAccounts.length
            ? 'unconfirmed'
            : 'reconciliation';
    await upsertDelivery(ctx, { scheduleId: sched.id, period: input.period, reportId, status: 'postponed', reason });
    await notify(
      ctx,
      {
        kind: 'report_postponed',
        recipients: { roles: ['owner', 'manager'], userIds: [sched.createdBy], clientId: sched.clientId },
        params: { client: client.name, reason },
        link: '/reports/schedules',
        dedupeKey: `postponed:${sched.id}:${input.period}:${reason}`,
      },
      { enqueue: deps.enqueue },
    );
    return 'postponed';
  }
  if (sched.mode === 'approval' && existing?.status !== 'approved') {
    await upsertDelivery(ctx, { scheduleId: sched.id, period: input.period, reportId, status: 'pending_approval' });
    await notify(
      ctx,
      {
        kind: 'report_needs_approval',
        recipients: { userIds: [sched.createdBy], roles: ['owner'], clientId: sched.clientId },
        params: { client: client.name, report: input.period },
        link: `/reports/${reportId}`,
        dedupeKey: `approval:${sched.id}:${input.period}`,
      },
      { enqueue: deps.enqueue },
    );
    return 'pending_approval';
  }
  return deliver({ ...ctx, actor: builder }, sched, input.period, reportId, deps);
}

/** R05 "Duyệt & gửi": đánh dấu đã duyệt rồi enqueue gửi lại kỳ đó (job kiểm toàn vẹn lần nữa). */
export async function approveDelivery(ctx: ActorCtx, deliveryId: string, deps: { enqueue: Enqueue }) {
  assertCan(ctx.actor, 'reports.manage');
  const [d] = await ctx.db
    .select()
    .from(reportDeliveries)
    .where(and(eq(reportDeliveries.workspaceId, ctx.workspaceId), eq(reportDeliveries.id, deliveryId)));
  if (!d) throw notFound('Lần gửi');
  const sched = await getSchedule(ctx, d.scheduleId);
  await getClient(ctx, sched.clientId);
  if (d.status !== 'pending_approval') throw new AppError('CONFLICT', 'Lần gửi không ở trạng thái chờ duyệt');
  await ctx.db
    .update(reportDeliveries)
    .set({ status: 'approved' })
    .where(and(eq(reportDeliveries.workspaceId, ctx.workspaceId), eq(reportDeliveries.id, d.id)));
  await deps.enqueue('notify:scheduled_report', {
    workspaceId: ctx.workspaceId,
    scheduleId: sched.id,
    period: d.period,
  });
}
