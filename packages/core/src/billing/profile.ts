import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import type { ActorCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';

const { billingProfiles } = schema;

export const billingProfileInput = z.object({
  companyName: z.string().trim().min(1).max(200),
  taxCode: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9-]*$/)
    .nullish()
    .transform((v) => v || null),
  address: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null),
  invoiceEmail: z.string().trim().email().max(200),
});
export type BillingProfileInput = z.input<typeof billingProfileInput>;

/** Thông tin xuất hóa đơn (ST03, 027). */
export async function getBillingProfile(ctx: ActorCtx) {
  assertCan(ctx.actor, 'billing.manage');
  const [p] = await ctx.db.select().from(billingProfiles).where(eq(billingProfiles.workspaceId, ctx.workspaceId));
  return p ?? null;
}

export async function saveBillingProfile(ctx: ActorCtx, input: BillingProfileInput) {
  assertCan(ctx.actor, 'billing.manage');
  const v = billingProfileInput.parse(input);
  const [p] = await ctx.db
    .insert(billingProfiles)
    .values({ workspaceId: ctx.workspaceId, ...v })
    .onConflictDoUpdate({ target: billingProfiles.workspaceId, set: { ...v, updatedAt: new Date() } })
    .returning();
  return p!;
}
