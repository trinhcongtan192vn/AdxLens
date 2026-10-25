import { z } from 'zod';
import { assignStoreClient, disconnectStore } from '@adxlens/core/stores';
import { route, uuidParam } from '@/server/route';

/** ADR-0029: gắn kết nối cửa hàng / analytics với Client (null = bỏ gắn). */
export const PATCH = route({
  auth: 'workspace',
  permission: 'connections.manage',
  body: z.object({ client_id: z.string().uuid().nullable() }),
  handler: async (ctx, { body }) => {
    await assignStoreClient(ctx, uuidParam(ctx, 'id'), body.client_id);
    return null;
  },
});

/** Ngắt kết nối: xóa token ngay và số liệu ngày của kết nối. */
export const DELETE = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    await disconnectStore(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
