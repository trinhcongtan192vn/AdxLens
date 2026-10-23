import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { AppError, systemClock, type Clock } from '@adxlens/core/shared';
import { assertSuperadmin, recordAdminAction, type StaffActor } from './staff';

const { systemSettings } = schema;

const alertEmailsSchema = z.object({ emails: z.array(z.string().email()).max(20) });
const maintenanceSchema = z.object({
  active: z.boolean(),
  messageVi: z.string().max(300),
  messageEn: z.string().max(300),
  /** Hiện đến lúc này (ISO); null = đến khi tắt. */
  endsAt: z.string().datetime({ offset: true }).nullable(),
});
export type MaintenanceNotice = z.infer<typeof maintenanceSchema>;

async function read<T>(db: DbOrTx, key: string, parse: (v: unknown) => T | null): Promise<T | null> {
  const [r] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key));
  return r ? parse(r.value) : null;
}

async function write(db: DbOrTx, key: string, value: Record<string, unknown>, actor: StaffActor, clock: Clock) {
  const now = clock.now();
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy: actor.userId, updatedAt: now })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedBy: actor.userId, updatedAt: now } });
}

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return r;
}

// ---------- Email nhận cảnh báo đội ----------

/** Email nhận cảnh báo đội đặt ở admin (gộp với `OPS_ALERT_EMAILS` của môi trường khi gửi). */
export async function opsAlertEmails(db: DbOrTx): Promise<string[]> {
  return (await read(db, 'ops_alert_emails', (v) => alertEmailsSchema.safeParse(v).data ?? null))?.emails ?? [];
}

/** Superadmin đặt danh sách email nhận cảnh báo sự cố P1/P2 (tối đa 20). Ghi nhật ký admin. */
export async function setOpsAlertEmails(
  db: DbOrTx,
  actor: StaffActor,
  input: { emails: string[]; reason: string },
  clock: Clock = systemClock,
) {
  assertSuperadmin(actor, 'Chỉ superadmin đổi kênh cảnh báo');
  const reason = requireReason(input.reason);
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const parsed = alertEmailsSchema.safeParse({ emails });
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Email không hợp lệ (tối đa 20)');
  await write(db, 'ops_alert_emails', parsed.data, actor, clock);
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'settings.alert_emails',
    targetType: 'system_setting',
    targetId: 'ops_alert_emails',
    reason,
    detail: { count: emails.length },
  });
  return emails;
}

/** Gộp email từ môi trường và từ admin, bỏ trùng. */
export function mergeAlertRecipients(fromEnv: string | undefined, fromDb: string[]): string[] {
  const env = (fromEnv ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...env, ...fromDb])];
}

// ---------- Thông báo bảo trì ----------

export async function maintenanceNotice(db: DbOrTx): Promise<MaintenanceNotice | null> {
  return read(db, 'maintenance_notice', (v) => maintenanceSchema.safeParse(v).data ?? null);
}

/** Thông báo đang hiện cho khách (đang bật và chưa qua `endsAt`), hoặc null. */
export async function activeMaintenanceNotice(db: DbOrTx, clock: Clock = systemClock) {
  const n = await maintenanceNotice(db);
  if (!n?.active) return null;
  if (n.endsAt && new Date(n.endsAt).getTime() <= clock.now().getTime()) return null;
  return n;
}

/**
 * Superadmin bật / tắt thông báo bảo trì cho mọi khách (banner trong app). Nội dung là văn bản thường do đội viết,
 * hiện nguyên văn (React escape) — không HTML. Ghi nhật ký admin.
 */
export async function setMaintenanceNotice(
  db: DbOrTx,
  actor: StaffActor,
  input: MaintenanceNotice & { reason: string },
  clock: Clock = systemClock,
) {
  assertSuperadmin(actor, 'Chỉ superadmin đổi thông báo bảo trì');
  const reason = requireReason(input.reason);
  const notice = maintenanceSchema.safeParse({
    active: input.active,
    messageVi: input.messageVi.trim(),
    messageEn: input.messageEn.trim(),
    endsAt: input.endsAt,
  });
  if (!notice.success) throw new AppError('VALIDATION_FAILED', 'Thông báo không hợp lệ');
  if (notice.data.active && (!notice.data.messageVi || !notice.data.messageEn)) {
    throw new AppError('VALIDATION_FAILED', 'Cần nội dung tiếng Việt và tiếng Anh');
  }
  await write(db, 'maintenance_notice', notice.data, actor, clock);
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: notice.data.active ? 'settings.maintenance_on' : 'settings.maintenance_off',
    targetType: 'system_setting',
    targetId: 'maintenance_notice',
    reason,
    detail: { endsAt: notice.data.endsAt },
  });
  return notice.data;
}
