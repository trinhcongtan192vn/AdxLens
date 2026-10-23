import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getReport, isBlocked, type ReportContent } from '@adxlens/core/reporting';
import { Banner, buttonVariants, Card, PageHeader, Skeleton } from '@adxlens/ui';
import { ReportView } from '@/report/report-view';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { deps } from '@/server/deps';
import { ReportToolbar, ReportPoller } from './report-tools';

export async function generateMetadata() {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

/** R03 Xem trước & chỉnh báo cáo (D, L đang dựng, X bị khóa chia sẻ). */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p0_reports');
  requirePermission(pc, 'reports.manage');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const report = await getReport(pc.ctx, id).catch(() => null);
  if (!report) notFound();
  const t = await getTranslations('reports');
  const content = report.content as ReportContent | null;
  const blocked = report.status === 'ready' && isBlocked(report.integrity);
  const logoUrl = content?.brand.logoPath ? deps().storage.publicUrl('brand', content.brand.logoPath) : null;
  const dates = [...new Set((report.integrity?.warningDates ?? []).flatMap((w) => w.dates))];

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="r" href="/reports" className="hover:text-fg">
            {t('title')}
          </Link>,
          content?.client.name ?? '',
        ]}
        title={report.edits.title || content?.client.name || t('title')}
        actions={
          <ReportToolbar id={report.id} edits={report.edits} ready={report.status === 'ready'} blocked={blocked} />
        }
      />
      {report.status === 'building' ? (
        <Card className="space-y-3 px-4 py-4">
          <ReportPoller />
          <p className="text-body text-fg-secondary" role="status">
            {t('view.building')}
          </p>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </Card>
      ) : report.status === 'failed' || !content ? (
        <Banner tone="danger">{t('view.failed', { code: report.error ?? '—' })}</Banner>
      ) : (
        <>
          {blocked ? (
            <Banner
              tone="warning"
              className="mb-3"
              title={t('view.blockedTitle')}
              action={
                <span className="flex gap-2">
                  {report.integrity?.unconfirmedAccounts.length ? (
                    <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
                      {t('view.goAssign')}
                    </Link>
                  ) : null}
                  {dates.length ? (
                    <Link
                      href={`/clients/${report.clientId}/reconciliation`}
                      className={buttonVariants({ kind: 'secondary', size: 's' })}
                    >
                      {t('view.goRecon')}
                    </Link>
                  ) : null}
                </span>
              }
            >
              {report.integrity?.unconfirmedAccounts.length
                ? `${t('view.unconfirmed', { count: report.integrity.unconfirmedAccounts.length })} `
                : ''}
              {dates.length ? `${t('view.warning', { dates: dates.join(', ') })} ` : ''}
              {t('view.fix')}
            </Banner>
          ) : null}
          <Card className="px-4 py-6 sm:px-8">
            <ReportView
              content={content}
              edits={report.edits}
              summary={report.summaryText}
              logoUrl={logoUrl}
              showBadge
            />
          </Card>
        </>
      )}
    </>
  );
}
