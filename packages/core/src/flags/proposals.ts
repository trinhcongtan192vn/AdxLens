import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { recordAdminAction, type StaffActor } from '@adxlens/core/ops';
import { AppError, forbidden, notFound, systemClock, type Clock } from '@adxlens/core/shared';
import type { FlagKey } from './registry';
import { enableFlag } from './service';

const { flagProposals, users, workspaces } = schema;

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return r;
}

/**
 * Operator đề xuất bật cờ cho workspace (ADR-0013); superadmin duyệt ở `approveFlagProposal`. Một workspace × cờ chỉ
 * có một đề xuất đang chờ.
 */
export async function proposeFlag(
  db: Db,
  actor: StaffActor,
  input: { workspaceId: string; key: FlagKey; reason: string },
) {
  const reason = requireReason(input.reason);
  const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, input.workspaceId));
  if (!ws) throw notFound('Workspace');
  const [pending] = await db
    .select({ id: flagProposals.id })
    .from(flagProposals)
    .where(
      and(
        eq(flagProposals.workspaceId, input.workspaceId),
        eq(flagProposals.flagKey, input.key),
        eq(flagProposals.status, 'pending'),
      ),
    );
  if (pending) throw new AppError('CONFLICT', 'Đã có đề xuất đang chờ duyệt cho cờ này');
  const [p] = await db
    .insert(flagProposals)
    .values({ workspaceId: input.workspaceId, flagKey: input.key, proposedBy: actor.userId, reason })
    .returning();
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'flag.propose',
    targetType: 'flag_proposal',
    targetId: p!.id,
    workspaceId: input.workspaceId,
    reason,
    detail: { flag: input.key },
  });
  return p!;
}

/** Đề xuất cho trang AD01 (staff). Xuyên workspace có chủ đích: chỉ route `auth: 'staff'` gọi. */
export async function listFlagProposals(
  db: Db,
  opts: { status?: (typeof schema.FLAG_PROPOSAL_STATUSES)[number] } = {},
) {
  return db
    .select({
      id: flagProposals.id,
      workspaceId: flagProposals.workspaceId,
      workspaceName: workspaces.name,
      flagKey: flagProposals.flagKey,
      reason: flagProposals.reason,
      status: flagProposals.status,
      proposedBy: flagProposals.proposedBy,
      proposerEmail: users.email,
      decisionNote: flagProposals.decisionNote,
      decidedAt: flagProposals.decidedAt,
      createdAt: flagProposals.createdAt,
    })
    .from(flagProposals)
    .innerJoin(workspaces, eq(workspaces.id, flagProposals.workspaceId))
    .leftJoin(users, eq(users.id, flagProposals.proposedBy))
    .where(opts.status ? eq(flagProposals.status, opts.status) : undefined)
    .orderBy(desc(flagProposals.createdAt))
    .limit(200);
}

async function pendingProposal(db: Db, id: string) {
  const [p] = await db.select().from(flagProposals).where(eq(flagProposals.id, id));
  if (!p) throw notFound('Đề xuất');
  if (p.status !== 'pending') throw new AppError('CONFLICT', 'Đề xuất đã được xử lý');
  return p;
}

/**
 * Superadmin duyệt: bật cờ qua `enableFlag` (vẫn chạy checklist; `override` do superadmin chọn và được ghi log).
 * Checklist chưa đạt mà không vượt → lỗi CONFLICT, đề xuất giữ nguyên trạng thái chờ.
 */
export async function approveFlagProposal(
  db: Db,
  actor: StaffActor,
  input: { id: string; note?: string; override?: boolean },
  clock: Clock = systemClock,
) {
  if (actor.role !== 'superadmin') throw forbidden('Chỉ superadmin duyệt đề xuất bật cờ');
  const p = await pendingProposal(db, input.id);
  const note = input.note?.trim() || null;
  const r = await enableFlag(
    db,
    {
      workspaceId: p.workspaceId,
      key: p.flagKey,
      staffUserId: actor.userId,
      reason: `Duyệt đề xuất: ${p.reason}${note ? ` — ${note}` : ''}`,
      override: input.override,
    },
    clock,
  );
  await db
    .update(flagProposals)
    .set({ status: 'approved', decidedBy: actor.userId, decidedAt: clock.now(), decisionNote: note })
    .where(eq(flagProposals.id, p.id));
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'flag.proposal_approve',
    targetType: 'flag_proposal',
    targetId: p.id,
    workspaceId: p.workspaceId,
    reason: note,
    detail: { flag: p.flagKey, override: r.override },
  });
  return { ...r, proposalId: p.id };
}

/** Superadmin từ chối (bắt buộc lý do), hoặc người đề xuất tự hủy. */
export async function closeFlagProposal(
  db: Db,
  actor: StaffActor,
  input: { id: string; decision: 'rejected' | 'canceled'; note: string },
  clock: Clock = systemClock,
) {
  const p = await pendingProposal(db, input.id);
  if (input.decision === 'rejected' && actor.role !== 'superadmin') throw forbidden('Chỉ superadmin từ chối đề xuất');
  if (input.decision === 'canceled' && p.proposedBy !== actor.userId) throw forbidden('Chỉ người đề xuất được hủy');
  const note = requireReason(input.note);
  await db
    .update(flagProposals)
    .set({ status: input.decision, decidedBy: actor.userId, decidedAt: clock.now(), decisionNote: note })
    .where(eq(flagProposals.id, p.id));
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: input.decision === 'rejected' ? 'flag.proposal_reject' : 'flag.proposal_cancel',
    targetType: 'flag_proposal',
    targetId: p.id,
    workspaceId: p.workspaceId,
    reason: note,
    detail: { flag: p.flagKey },
  });
}
