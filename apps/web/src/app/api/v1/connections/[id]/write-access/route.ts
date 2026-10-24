import { z } from 'zod';
import { setWriteEnabled } from '@adxlens/core/connections';
import { route, uuidParam } from '@/server/route';

/** P201: bật lại (khi đã có scope ghi) hoặc thu hồi quyền ghi của kết nối — có hiệu lực ngay. Owner. */
export const POST = route({
  auth: 'workspace',
  permission: 'write_scope.manage',
  flag: 'p2a_approve',
  body: z.object({ enabled: z.boolean() }),
  handler: async (ctx, { body }) => {
    await setWriteEnabled(ctx, uuidParam(ctx, 'id'), body.enabled);
    return null;
  },
});
