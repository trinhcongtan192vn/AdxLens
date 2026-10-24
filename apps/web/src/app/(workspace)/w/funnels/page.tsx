import { getTranslations } from 'next-intl/server';
import { WsComing } from '@/components/workspace/ws-coming';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.funnels') };
}

export default async function Page() {
  const t = await getTranslations('ws');
  return <WsComing title={t('nav.funnels')} />;
}
