import { getTranslations } from 'next-intl/server';
import { Card, EmptyState } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';

/** ST05 Thông báo — đầy đủ ở feature 023. */
export default async function NotificationSettingsPage() {
  await getPageContext();
  const t = await getTranslations();
  return (
    <Card>
      <EmptyState title={t('settings.notifications')} description={t('placeholder.comingSoon')} />
    </Card>
  );
}
