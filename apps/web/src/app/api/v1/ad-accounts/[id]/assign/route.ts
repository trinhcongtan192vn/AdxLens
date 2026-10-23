import { z } from 'zod';
import { assignAdAccount, unassignAdAccount } from '@adxlens/core/connections';
import { route, uuidParam } from '@/server/route';

/** S05 "Xác nhận": gán tài khoản QC cho Client có sẵn hoặc tạo Client mới (L3 10.2). */
export const POST = route({
  auth: 'workspace',
  permission: 'clients.manage',
  body: z
    .object({
      client_id: z.string().uuid().optional(),
      create_client_name: z.string().trim().min(1).max(120).optional(),
    })
    .refine((b) => Boolean(b.client_id) !== Boolean(b.create_client_name), {
      message: 'Cần đúng một trong client_id hoặc create_client_name',
    }),
  handler: async (ctx, { body }) => {
    const r = await assignAdAccount(ctx, uuidParam(ctx, 'id'), {
      clientId: body.client_id,
      createClientName: body.create_client_name,
    });
    return { ad_account_id: r.id, client_id: r.clientId, assignment_status: r.assignmentStatus };
  },
});

/** Bỏ gán tài khoản khỏi Client. */
export const DELETE = route({
  auth: 'workspace',
  permission: 'clients.manage',
  handler: async (ctx) => {
    await unassignAdAccount(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
