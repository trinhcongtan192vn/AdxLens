import { sendNotificationEmail } from '@adxlens/core/notification';
import type { HandlerMap } from '../handler';

export const notifyHandlers: HandlerMap = {
  // Email của thông báo (P0-25): nội dung theo loại + locale người nhận.
  'notify:send_email': async (p, { db, email, appUrl }) => ({
    status: await sendNotificationEmail({ db, workspaceId: p.workspaceId }, p.notificationId, { email, appUrl }),
  }),
};
