import { getTranslations } from 'next-intl/server';
import { StatusPage } from '@/components/status-page';

/** X01 404 — không lộ thông tin. */
export default async function NotFound() {
  const t = await getTranslations('errors');
  return <StatusPage code="404" title={t('notFoundTitle')} body={t('notFoundBody')} homeLabel={t('goHome')} />;
}
