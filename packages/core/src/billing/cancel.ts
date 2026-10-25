import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, type ActorCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { setStripeCancel, type StripeApi } from './stripe';

const { subscriptions } = schema;

/**
 * Hủy gói cuối kỳ / tiếp tục gói (ST03). Stripe: báo Stripe ngừng gia hạn. PayOS: không tự gia hạn — chỉ
 * ghi cờ để không nhắc gia hạn và hết kỳ thì về Free thay vì quá hạn.
 */
export async function setCancelAtPeriodEnd(
  ctx: ActorCtx,
  cancel: boolean,
  deps: { stripe: () => StripeApi },
): Promise<void> {
  assertCan(ctx.actor, 'billing.manage');
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (sub?.provider === 'stripe') return setStripeCancel(ctx, cancel, { stripe: deps.stripe() });
  if (sub?.provider !== 'payos' || sub.status === 'canceled')
    throw new AppError('CONFLICT', 'Không có gói trả phí đang chạy');
  await ctx.db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: cancel })
    .where(eq(subscriptions.workspaceId, ctx.workspaceId));
}
