import { z } from 'zod';
import { clientPacing, deleteClientBudget, setClientBudget } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** A3: tiến độ ngân sách tháng hiện tại của Client (null khi chưa đặt ngân sách). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => ({ pacing: await clientPacing(ctx, uuidParam(ctx, 'id')) }),
});

/** Đặt ngân sách tháng (tiền dạng chuỗi số, tiền tệ trùng tài khoản QC của Client). */
export const PUT = route({
  auth: 'workspace',
  permission: 'clients.manage',
  body: z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount: z.string().regex(/^\d{1,14}(\.\d{1,2})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  handler: async (ctx, { body }) => {
    const b = await setClientBudget(ctx, { clientId: uuidParam(ctx, 'id'), ...body });
    return { id: b.id, month: b.month, amount: b.amount, currency: b.currency };
  },
});

export const DELETE = route({
  auth: 'workspace',
  permission: 'clients.manage',
  query: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  handler: async (ctx, { query }) => {
    await deleteClientBudget(ctx, { clientId: uuidParam(ctx, 'id'), month: query.month });
    return null;
  },
});
