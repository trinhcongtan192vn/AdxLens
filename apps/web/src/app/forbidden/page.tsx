import { getTranslations } from 'next-intl/server';
import { StatusPage } from '@/components/status-page';

/** X02 403 — gợi ý liên hệ owner. */
export default async function Forbidden() {
  const t = await getTranslations('errors');
  return <StatusPage code="403" title={t('forbiddenTitle')} body={t('forbiddenBody')} homeLabel={t('goHome')} />;
}
