import { Bell } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { listNotifications } from '@adxlens/core/notification';
import { Card, EmptyState, PageHeader } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';
import { translateText } from '@/server/translate';
import { NotificationList } from './notification-list';

export async function generateMetadata() {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

/** X05 Trung tâm thông báo (P0-25): cùng nội dung với email; bấm để mở và đánh dấu đã đọc. */
export default async function NotificationsPage() {
  const pc = await getPageContext();
  const t = await getTranslations('notifications');
  const format = await getFormatter();
  const locale = pc.user.locale === 'en' ? 'en' : 'vi';
  const items = await listNotifications(pc.ctx, pc.actor.userId);
  return (
    <>
      <PageHeader title={t('title')} />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell />} title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <NotificationList
          items={items.map((n) => ({
            id: n.id,
            title: translateText(locale, { key: `notifications.kinds.${n.kind}.title`, params: n.params }),
            body: translateText(locale, { key: `notifications.kinds.${n.kind}.body`, params: n.params }),
            link: n.link,
            read: n.readAt !== null,
            when: format.dateTime(n.createdAt, { dateStyle: 'short', timeStyle: 'short' }),
          }))}
        />
      )}
    </>
  );
}
