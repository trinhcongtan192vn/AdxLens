import { getNow, getTranslations } from 'next-intl/server';
import { listClientGoals, suggestReportTemplate } from '@adxlens/core/reporting';
import { listClients } from '@adxlens/core/tenancy';
import { Card, EmptyState, PageHeader } from '@adxlens/ui';
import { periodRange } from '@/lib/period';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { NewReportForm } from './new-report-form';

export async function generateMetadata() {
  const t = await getTranslations('reports');
  return { title: t('new.title') };
}

/** R02 Tạo báo cáo: chọn Client, kỳ, loại, ngôn ngữ. */
export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p0_reports');
  requirePermission(pc, 'reports.manage');
  const t = await getTranslations('reports');
  const now = await getNow();
  const [clients, goals] = await Promise.all([listClients(pc.ctx), listClientGoals(pc.ctx)]);
  const tz = 'Asia/Ho_Chi_Minh';
  const presets = {
    last7: periodRange('last7', now, tz),
    last30: periodRange('last30', now, tz),
    lastMonth: periodRange('lastMonth', now, tz),
  };
  return (
    <>
      <PageHeader title={t('new.title')} />
      <Card className="max-w-xl px-4 py-4">
        {clients.length === 0 ? (
          <EmptyState title={t('new.noClients')} />
        ) : (
          <NewReportForm
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              locale: (c.reportLocale as 'vi' | 'en' | null) ?? null,
              // Mẫu gợi ý theo mục tiêu chính của Client (ADR-0017).
              template: suggestReportTemplate(goals.get(c.id)?.primaryMetric),
            }))}
            defaultClient={(await searchParams).client ?? null}
            presets={presets}
          />
        )}
      </Card>
    </>
  );
}
