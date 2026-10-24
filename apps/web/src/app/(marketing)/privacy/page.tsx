import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal-page';

export async function generateMetadata() {
  const t = await getTranslations('marketing.privacy');
  return { title: t('title') };
}

/** M03 Chính sách quyền riêng tư. */
export default async function Privacy() {
  const t = await getTranslations('marketing.privacy');
  return (
    <LegalPage
      title={t('title')}
      updated={t('updated')}
      sections={[
        { title: t('read.title'), body: t('read.body') },
        { title: t('store.title'), body: t('store.body') },
        {
          title: t('rights.title'),
          body: t.rich('rights.body', {
            link: (chunks) => (
              <Link href="/data-deletion" className="text-link hover:underline">
                {chunks}
              </Link>
            ),
          }),
        },
      ]}
    />
  );
}
