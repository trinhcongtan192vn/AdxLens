import { z } from 'zod';
import { executionControls, setWorkspaceKillSwitch } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** P205: kill switch của workspace + trạng thái circuit breaker (Owner). Sau cờ `p2a_approve`. */
export const GET = route({
  auth: 'workspace',
  permission: 'guardrails.manage',
  flag: 'p2a_approve',
  handler: async (ctx) => executionControls(ctx),
});

/** Bật (cần lý do) → hủy ngay mọi hành động đang chờ; tắt → cho phép duyệt lại. */
export const POST = route({
  auth: 'workspace',
  permission: 'guardrails.manage',
  flag: 'p2a_approve',
  body: z.object({ active: z.boolean(), reason: z.string().max(500).default('') }),
  handler: async (ctx, { body }) => setWorkspaceKillSwitch(ctx, body),
});
