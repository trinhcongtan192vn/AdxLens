import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getEnv } from '@adxlens/config/env';
import { getReport, listShareLinks, shareBlockReasons, type ReportContent } from '@adxlens/core/reporting';
import { Banner, buttonVariants, PageHeader } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { ShareManager } from './share-manager';

export async function generateMetadata() {
  const t = await getTranslations('share');
  return { title: t('title') };
}

/** R04 Chia sẻ báo cáo (dạng trang — PM chốt 22/10/2026): D, X (bị chặn BR01). */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p0_reports');
  requirePermission(pc, 'reports.manage');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const report = await getReport(pc.ctx, id).catch(() => null);
  if (!report) notFound();
  const t = await getTranslations('share');
  const tr = await getTranslations('reports');
  const content = report.content as ReportContent | null;
  const block = report.status === 'ready' ? await shareBlockReasons(pc.ctx, report) : null;
  const links = await listShareLinks(pc.ctx, id);
  const base = getEnv().PUBLIC_REPORT_URL.replace(/\/$/, '');
  const dates = [...new Set((block?.integrity.warningDates ?? []).flatMap((w) => w.dates))];

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="r" href="/reports" className="hover:text-fg">
            {tr('title')}
          </Link>,
          <Link key="v" href={`/reports/${id}`} className="hover:text-fg">
            {report.edits.title || content?.client.name}
          </Link>,
          t('title'),
        ]}
        title={t('title')}
      />
      {block?.blocked ? (
        <Banner
          tone="warning"
          className="mb-3"
          title={t('blockedTitle')}
          action={
            <span className="flex gap-2">
              {block.integrity.unconfirmedAccounts.length ? (
                <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
                  {tr('view.goAssign')}
                </Link>
              ) : null}
              {dates.length ? (
                <Link
                  href={`/clients/${report.clientId}/reconciliation`}
                  className={buttonVariants({ kind: 'secondary', size: 's' })}
                >
                  {tr('view.goRecon')}
                </Link>
              ) : null}
            </span>
          }
        >
          {t('blockedBody')}{' '}
          {block.integrity.unconfirmedAccounts.length
            ? `${tr('view.unconfirmed', { count: block.integrity.unconfirmedAccounts.length })} `
            : ''}
          {dates.length ? `${tr('view.warning', { dates: dates.join(', ') })} ` : ''}
          {block.connectionRevoked ? t('connectionRevoked') : ''}
        </Banner>
      ) : null}
      <ShareManager
        reportId={id}
        canCreate={report.status === 'ready' && !block?.blocked}
        links={links.map((l) => ({
          id: l.id,
          url: `${base}/${l.token}`,
          hasPassword: l.passwordHash !== null,
          expiresAt: l.expiresAt?.toISOString() ?? null,
          revokedAt: l.revokedAt?.toISOString() ?? null,
          viewCount: l.viewCount,
        }))}
      />
    </>
  );
}
