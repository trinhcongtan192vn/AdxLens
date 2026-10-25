import { listAdAccounts } from '@adxlens/core/connections';
import { getActionPlan, getCreativeDraft, type PlanStep } from '@adxlens/core/execution';
import { canApproveActions } from '@adxlens/core/tenancy';
import { route, uuidParam } from '@/server/route';

/**
 * ADR-0031: kế hoạch hành động để duyệt — đủ tham số từng bước, ảnh của bước creative (URL có chữ ký 1 giờ), kết quả từng
 * bước khi đang / đã chạy. Sau cờ P2a; chỉ kế hoạch của tài khoản QC người dùng xem được.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const plan = await getActionPlan(ctx, uuidParam(ctx, 'id'));
    const account = (await listAdAccounts(ctx)).find((a) => a.id === plan.adAccountId)!;
    const steps = plan.steps as PlanStep[];
    const images = await Promise.all(
      steps.map(async (s) => {
        if (s.kind !== 'create_creative') return null;
        const d = await getCreativeDraft(ctx, s.draftId).catch(() => null);
        return d?.status === 'ready' && d.storagePath
          ? await ctx.storage.signedUrl('creatives', d.storagePath, 3600)
          : null;
      }),
    );
    return {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      account: { id: account.id, name: account.name, currency: account.currency },
      steps: steps.map((s, i) => ({ ...s, image_url: images[i] })),
      results: plan.results,
      expires_at: plan.expiresAt.toISOString(),
      expired: plan.status === 'proposed' && plan.expiresAt <= new Date(),
      can_approve: account.clientId ? canApproveActions(ctx.actor, account.clientId) : ctx.actor.role !== 'buyer',
    };
  },
});
