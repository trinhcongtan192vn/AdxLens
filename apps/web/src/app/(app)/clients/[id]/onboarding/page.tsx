import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listAssets } from '@adxlens/core/connections';
import { GOAL_METRICS, getClientGoal, goalSuggestions, INDUSTRIES } from '@adxlens/core/reporting';
import { can, getClient } from '@adxlens/core/tenancy';
import { PageHeader } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';
import { OnboardingWizard } from './onboarding-wizard';

export async function generateMetadata() {
  const t = await getTranslations('goals');
  return { title: t('title') };
}

/** ADR-0017: onboarding theo Client — mục tiêu chính (kèm số thực tế), chỉ số phụ, ngành + tài sản mặc định. */
export default async function ClientOnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pc = await getPageContext();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await getClient(pc.ctx, id).catch(() => null);
  if (!client || client.archivedAt) notFound();
  const t = await getTranslations('goals');
  const [goal, suggestions, assets] = await Promise.all([
    getClientGoal(pc.ctx, id),
    goalSuggestions(pc.ctx, id),
    listAssets(pc.ctx),
  ]);
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="c" href="/clients" className="hover:text-fg">
            {t('clients')}
          </Link>,
          <Link key="n" href={`/clients/${id}`} className="hover:text-fg">
            {client.name}
          </Link>,
          t('title'),
        ]}
        title={t('title')}
      />
      <OnboardingWizard
        clientId={id}
        clientName={client.name}
        canManage={can(pc.ctx.actor.role, 'clients.manage')}
        metrics={GOAL_METRICS}
        industries={INDUSTRIES}
        suggestions={suggestions}
        assets={assets.map((a) => ({ kind: a.kind, metaId: a.metaId, name: a.name, parentId: a.parentId }))}
        initial={{
          primaryMetric: goal?.primaryMetric ?? null,
          primaryTarget: goal?.primaryTarget ?? null,
          secondaryMetrics: goal?.secondaryMetrics ?? [],
          industry: goal?.industry ?? null,
          subIndustry: goal?.subIndustry ?? null,
          defaultPageId: goal?.defaultPageId ?? null,
          defaultInstagramId: goal?.defaultInstagramId ?? null,
          defaultPixelId: goal?.defaultPixelId ?? null,
        }}
      />
    </>
  );
}
