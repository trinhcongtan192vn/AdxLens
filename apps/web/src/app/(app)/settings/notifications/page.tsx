import { getNotificationSettings } from '@adxlens/core/notification';
import { getPageContext } from '@/server/page-context';
import { NotificationSettingsForm } from './settings-form';

/** ST05 Thông báo: nhận gì trong app / qua email; sự cố số liệu, token, thanh toán luôn bật. */
export default async function NotificationSettingsPage() {
  const pc = await getPageContext();
  const items = await getNotificationSettings(pc.ctx, pc.actor.userId);
  return <NotificationSettingsForm items={items} />;
}
