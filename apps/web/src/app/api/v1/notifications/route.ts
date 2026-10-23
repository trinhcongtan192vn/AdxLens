import { listNotifications, markRead, unreadCount } from '@adxlens/core/notification';
import { route } from '@/server/route';
import { requestLocale, translateText } from '@/server/translate';

/** X05: thông báo của người dùng trong workspace hiện tại (nội dung đã dịch). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const locale = requestLocale(ctx.req);
    const items = await listNotifications(ctx, ctx.actor.userId);
    return {
      unread: await unreadCount(ctx, ctx.actor.userId),
      items: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: translateText(locale, { key: `notifications.kinds.${n.kind}.title`, params: n.params }),
        body: translateText(locale, { key: `notifications.kinds.${n.kind}.body`, params: n.params }),
        link: n.link,
        read: n.readAt !== null,
        created_at: n.createdAt.toISOString(),
      })),
    };
  },
});

/** Đánh dấu đã đọc tất cả. */
export const POST = route({
  auth: 'workspace',
  handler: async (ctx) => ({ marked: await markRead(ctx, ctx.actor.userId) }),
});
