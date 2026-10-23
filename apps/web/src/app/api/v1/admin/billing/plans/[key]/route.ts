import { z } from 'zod';
import { PLAN_KEYS } from '@adxlens/core/billing';
import { updatePlan } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** Superadmin sửa giá / số tài khoản kèm / phí vượt của một gói (tiền là chuỗi số, không float). */
export const PATCH = route({
  auth: 'staff',
  body: z.object({
    monthly_price_vnd: z.string().regex(/^\d{1,14}$/),
    monthly_price_usd: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/)
      .nullable(),
    included_accounts: z.number().int().min(1).max(10_000),
    extra_account_vnd: z.string().regex(/^\d{1,14}$/),
    reason: z.string().trim().min(5).max(500),
  }),
  handler: async (ctx, { body }) => {
    const key = z.enum(PLAN_KEYS).safeParse(ctx.params.key);
    if (!key.success) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    await updatePlan(ctx.db, staffActor(ctx), {
      key: key.data,
      monthlyPriceVnd: body.monthly_price_vnd,
      monthlyPriceUsd: body.monthly_price_usd,
      includedAccounts: body.included_accounts,
      extraAccountVnd: body.extra_account_vnd,
      reason: body.reason,
    });
    return null;
  },
});
