import { effectiveGuardrails, GUARDRAIL_DEFAULTS, guardrailsInput, saveGuardrails } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** P205 guardrails của workspace (Owner): giá trị hiệu lực + mặc định khóa. Sau cờ `p2a_approve`. */
export const GET = route({
  auth: 'workspace',
  permission: 'guardrails.manage',
  flag: 'p2a_approve',
  handler: async (ctx) => ({ guardrails: await effectiveGuardrails(ctx), defaults: GUARDRAIL_DEFAULTS }),
});

/** Chỉ chặt hơn mặc định; nới lỏng → 422 `GUARDRAIL_VIOLATION`. */
export const PUT = route({
  auth: 'workspace',
  permission: 'guardrails.manage',
  flag: 'p2a_approve',
  body: guardrailsInput,
  handler: async (ctx, { body }) => ({ guardrails: await saveGuardrails(ctx, body) }),
});
