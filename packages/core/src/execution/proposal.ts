import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { AppError, notFound, type ActorCtx, type Clock } from '@adxlens/core/shared';
import { listAdAccounts } from '@adxlens/core/connections';
import { canApproveActions } from '@adxlens/core/tenancy';
import { minorUnits, previewAction, requestAction, type ActionRequest } from './gateway';
import { GUARDRAIL_DEFAULTS, type ActionType } from './guardrails';

const { recommendations } = schema;

/**
 * Gợi ý nào chuyển được thành hành động ghi v1 (ADR-0009..0011). Ngân sách: giảm đúng mức tối đa của
 * guardrails mặc định (−15%), không bao giờ tăng tự động từ gợi ý.
 */
export const EXECUTABLE_SOURCES: Record<string, ActionType> = {
  creative_fatigue: 'pause_ad',
  spend_no_conversion: 'pause_adset',
  budget_misallocation: 'set_adset_budget',
  creative_loser: 'pause_ad',
};

async function loadRec(ctx: ActorCtx, id: string) {
  const [r] = await ctx.db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.workspaceId, ctx.workspaceId), eq(recommendations.id, id)));
  if (!r) throw new AppError('NOT_FOUND', 'Không tìm thấy gợi ý');
  return r;
}

/** Đối tượng thực của gợi ý: creative thua chỉ khi đúng một ad dùng creative đó. */
async function targetOf(ctx: ActorCtx, rec: typeof recommendations.$inferSelect, type: ActionType) {
  if (rec.entityType === 'creative') {
    const ads = await ctx.db.execute<{ meta_id: string }>(sql`
      select meta_id from analytics.entities where workspace_id = ${ctx.workspaceId}
        and ad_account_id = ${rec.adAccountId} and entity_type = 'ad' and attrs->>'creative_id' = ${rec.metaId}`);
    return ads.length === 1 ? ads[0]!.meta_id : null;
  }
  const want = type === 'pause_ad' ? 'ad' : 'adset';
  return rec.entityType === want ? rec.metaId : null;
}

async function requestFor(ctx: ActorCtx, recId: string): Promise<ActionRequest | null> {
  const rec = await loadRec(ctx, recId);
  const type = EXECUTABLE_SOURCES[rec.sourceKey];
  if (!type) return null;
  const target = await targetOf(ctx, rec, type);
  if (!target) return null;
  let newDailyBudget: string | null = null;
  if (type === 'set_adset_budget') {
    const [e] = await ctx.db.execute<{ daily_budget: string | null }>(sql`
      select daily_budget::text as daily_budget from analytics.entities where workspace_id = ${ctx.workspaceId}
        and ad_account_id = ${rec.adAccountId} and entity_type = 'adset' and meta_id = ${target}`);
    const cur = minorUnits(e?.daily_budget ?? null);
    if (!cur) return null;
    const pct = BigInt(Math.round(Number(GUARDRAIL_DEFAULTS.maxBudgetChangePct)));
    newDailyBudget = String((BigInt(cur) * (100n - pct)) / 100n);
  }
  return {
    adAccountId: rec.adAccountId,
    actionType: type,
    targetMetaId: target,
    newDailyBudget,
    recommendationId: rec.id,
  };
}

/**
 * P202 nội dung hộp thoại duyệt: hành động đề xuất, trước / sau, vi phạm guardrails, cảnh báo (không hoàn tác
 * được; tạm dừng ad cuối cùng đang chạy của ad set), người xem có quyền duyệt không.
 */
export async function proposalForRecommendation(ctx: ActorCtx, recId: string, clock?: Clock) {
  const req = await requestFor(ctx, recId);
  if (!req) return { executable: false as const };
  const p = await previewAction(ctx, req, clock);
  const warnings: string[] = [];
  if (!p.undoable) warnings.push('not_undoable');
  if (req.actionType === 'set_adset_budget') warnings.push('learning_reset');
  if (req.actionType === 'pause_ad') {
    const [r] = await ctx.db.execute<{ n: string }>(sql`
      select count(*)::text as n from analytics.entities a
      where a.workspace_id = ${ctx.workspaceId} and a.ad_account_id = ${req.adAccountId} and a.entity_type = 'ad'
        and a.status = 'ACTIVE' and a.parent_meta_id = (select parent_meta_id from analytics.entities
          where workspace_id = ${ctx.workspaceId} and ad_account_id = ${req.adAccountId} and entity_type = 'ad'
            and meta_id = ${req.targetMetaId})`);
    if (Number(r?.n ?? 0) <= 1) warnings.push('last_active_ad');
  }
  const canApprove = p.account.clientId ? canApproveActions(ctx.actor, p.account.clientId) : ctx.actor.role !== 'buyer';
  return {
    executable: true as const,
    actionType: req.actionType,
    target: { type: p.targetType, metaId: req.targetMetaId, name: p.targetName },
    accountName: p.account.name,
    currency: p.account.currency,
    before: p.before,
    after: p.after,
    violations: p.violations,
    undoable: p.undoable,
    warnings,
    canApprove,
  };
}

/** P2-03 duyệt 1 click từ gợi ý: gửi đúng đề xuất qua Execution Gateway; gợi ý chuyển "Đang làm". */
export async function approveRecommendation(ctx: ActorCtx, recId: string, deps: { enqueue: Enqueue; clock?: Clock }) {
  const req = await requestFor(ctx, recId);
  if (!req) throw new AppError('CONFLICT', 'Gợi ý này không thực hiện tự động được');
  const action = await requestAction(ctx, req, deps);
  await ctx.db
    .update(recommendations)
    .set({
      status: 'in_progress',
      statusChangedBy: ctx.actor.userId,
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(recommendations.workspaceId, ctx.workspaceId),
        eq(recommendations.id, recId),
        eq(recommendations.status, 'proposed'),
      ),
    );
  return action;
}

/** Số gợi ý tối đa mỗi lần duyệt hàng loạt (B2). */
export const BULK_APPROVE_LIMIT = 20;

export type BulkApproveResult =
  { id: string; ok: true; actionId: string } | { id: string; ok: false; code: string; message: string };

/**
 * Duyệt hàng loạt từ Việc tuần này (roadmap B2): lần lượt từng gợi ý qua `approveRecommendation` — mỗi cái vẫn qua đủ
 * cờ, gói, kill switch, breaker, quyền, guardrails (số hành động / ngày tính dần theo từng cái). Một cái lỗi không
 * dừng cả lô; trả kết quả từng cái. Tối đa 20, bỏ trùng.
 */
export async function approveRecommendations(
  ctx: ActorCtx,
  ids: string[],
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<BulkApproveResult[]> {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > BULK_APPROVE_LIMIT) {
    throw new AppError('VALIDATION_FAILED', `Chọn 1–${BULK_APPROVE_LIMIT} gợi ý`);
  }
  // Mọi id phải thuộc workspace hiện tại; có id lạ (hoặc của workspace khác) → từ chối cả lô, không lộ id nào hợp lệ.
  const own = await ctx.db
    .select({ id: recommendations.id })
    .from(recommendations)
    .where(and(eq(recommendations.workspaceId, ctx.workspaceId), inArray(recommendations.id, unique)));
  if (own.length !== unique.length) throw notFound('Gợi ý');
  const out: BulkApproveResult[] = [];
  for (const id of unique) {
    try {
      const a = await approveRecommendation(ctx, id, deps);
      out.push({ id, ok: true, actionId: a.id });
    } catch (e) {
      // Lỗi nghiệp vụ (vi phạm guardrail, không tự động được, không có quyền…) ghi theo từng gợi ý; lỗi khác (DB…) ném lên.
      if (!(e instanceof AppError)) throw e;
      out.push({ id, ok: false, code: e.code, message: e.message });
    }
  }
  return out;
}

/**
 * G4: tạm dừng / bật lại / đổi ngân sách nhiều đối tượng từ bảng chiến dịch (không từ gợi ý): lần lượt từng cái qua
 * `requestAction` — đủ cờ, gói, kill switch, breaker, quyền ghi, quyền duyệt theo Client, guardrails (số hành động /
 * ngày tính dần). Tài khoản ngoài phạm vi người dùng → 404 cả lô; lỗi nghiệp vụ từng cái trả về, không dừng cả lô.
 */
export async function requestManualActions(
  ctx: ActorCtx,
  items: ActionRequest[],
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<BulkApproveResult[]> {
  if (!items.length || items.length > BULK_APPROVE_LIMIT) {
    throw new AppError('VALIDATION_FAILED', `Chọn 1–${BULK_APPROVE_LIMIT} đối tượng`);
  }
  const visible = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  if (items.some((i) => !visible.has(i.adAccountId))) throw notFound('Tài khoản');
  const out: BulkApproveResult[] = [];
  for (const item of items) {
    const id = `${item.adAccountId}:${item.targetMetaId}`;
    try {
      const a = await requestAction(ctx, { ...item, recommendationId: null, undoOf: null }, deps);
      out.push({ id, ok: true, actionId: a.id });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      out.push({ id, ok: false, code: e.code, message: e.message });
    }
  }
  return out;
}
