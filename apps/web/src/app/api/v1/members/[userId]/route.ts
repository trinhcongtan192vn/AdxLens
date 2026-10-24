import { z } from 'zod';
import { removeMember, updateMember } from '@adxlens/core/tenancy';
import { route, uuidParam } from '@/server/route';

/** ST02 "Sửa": vai trò, Client được gán, quyền duyệt hành động theo Client (chỉ owner). */
export const PATCH = route({
  auth: 'workspace',
  permission: 'members.manage',
  body: z.object({
    role: z.enum(['manager', 'buyer']).optional(),
    clientAccess: z.array(z.string().uuid()).max(500).optional(),
    approveClientIds: z.array(z.string().uuid()).max(500).optional(),
  }),
  handler: async (ctx, { body }) => {
    await updateMember(ctx, uuidParam(ctx, 'userId'), body);
    return null;
  },
});

/** Xóa thành viên khỏi workspace (không xóa được owner). */
export const DELETE = route({
  auth: 'workspace',
  permission: 'members.manage',
  handler: async (ctx) => {
    await removeMember(ctx, uuidParam(ctx, 'userId'));
    return null;
  },
});
