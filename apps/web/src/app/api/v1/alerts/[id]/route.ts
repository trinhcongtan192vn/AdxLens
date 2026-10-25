import { z } from 'zod';
import { deleteAlert, setAlertEnabled } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** Bật / tắt cảnh báo. */
export const PATCH = route({
  auth: 'workspace',
  body: z.object({ enabled: z.boolean() }),
  handler: async (ctx, { body }) => {
    await setAlertEnabled(ctx, uuidParam(ctx, 'id'), body.enabled);
    return null;
  },
});

export const DELETE = route({
  auth: 'workspace',
  handler: async (ctx) => {
    await deleteAlert(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
