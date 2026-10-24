import { getTranslations } from 'next-intl/server';
import { WsComing } from '@/components/workspace/ws-coming';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.agents') };
}

/** Agents (ADR-0019) sau cờ `p1_recommendations`, kiểm ở server. */
export default async function Page() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('ws');
  return <WsComing title={t('nav.agents')} />;
}
