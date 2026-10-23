import { createRule, listRules, ruleInputSchema } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** P211 danh sách rule tự động; P212 tạo rule (luôn ở shadow). Sau cờ `p2b_auto`. */
export const GET = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  handler: async (ctx) => ({
    items: (await listRules(ctx)).map((r) => ({
      id: r.id,
      name: r.name,
      ad_account_id: r.adAccountId,
      account_name: r.accountName,
      level: r.level,
      condition: r.condition,
      action: r.action,
      mode: r.mode,
      shadow_started_at: r.shadowStartedAt,
      live_since: r.liveSince,
    })),
  }),
});

export const POST = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  body: ruleInputSchema,
  handler: async (ctx, { body }) => {
    const r = await createRule(ctx, body);
    return Response.json({ id: r.id, mode: r.mode }, { status: 201 });
  },
});
