import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal-page';

export async function generateMetadata() {
  const t = await getTranslations('marketing.terms');
  return { title: t('title') };
}

/** M04 Điều khoản sử dụng. */
export default async function Terms() {
  const t = await getTranslations('marketing.terms');
  return (
    <LegalPage
      title={t('title')}
      updated={t('updated')}
      sections={(['service', 'responsibility', 'billing'] as const).map((k) => ({
        title: t(`${k}.title`),
        body: t(`${k}.body`),
      }))}
    />
  );
}
