import { z } from 'zod';
import {
  getNotificationSettings,
  NOTIFICATION_KIND_LIST,
  updateNotificationSettings,
} from '@adxlens/core/notification';
import { route } from '@/server/route';

const dto = (items: Awaited<ReturnType<typeof getNotificationSettings>>) => ({
  items: items.map((i) => ({ kind: i.kind, mandatory: i.mandatory, in_app: i.inApp, email: i.email })),
});

/** ST05: nhận thông báo gì (trong app / email); loại bắt buộc luôn bật. */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => dto(await getNotificationSettings(ctx, ctx.actor.userId)),
});

export const PATCH = route({
  auth: 'workspace',
  body: z.object({
    items: z
      .array(
        z.object({
          kind: z.enum(NOTIFICATION_KIND_LIST as [string, ...string[]]),
          in_app: z.boolean(),
          email: z.boolean(),
        }),
      )
      .max(50),
  }),
  handler: async (ctx, { body }) =>
    dto(
      await updateNotificationSettings(
        ctx,
        ctx.actor.userId,
        body.items.map((i) => ({ kind: i.kind as never, inApp: i.in_app, email: i.email })),
      ),
    ),
});
