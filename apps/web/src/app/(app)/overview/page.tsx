import { getTranslations } from 'next-intl/server';
import { Card, EmptyState, PageHeader } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('overview') };
}

/** O01 Tổng quan agency — dữ liệu đầy đủ ở feature 018. */
export default async function OverviewPage() {
  await getPageContext();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t('nav.overview')} />
      <Card>
        <EmptyState title={t('nav.overview')} description={t('placeholder.comingSoon')} />
      </Card>
    </>
  );
}
