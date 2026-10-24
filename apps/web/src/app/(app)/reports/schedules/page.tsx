import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listSchedules } from '@adxlens/core/reporting';
import { listClients } from '@adxlens/core/tenancy';
import { Card, EmptyState, PageHeader } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { ScheduleManager } from './schedule-manager';

export async function generateMetadata() {
  const t = await getTranslations('schedules');
  return { title: t('title') };
}

/** R05 Lịch gửi báo cáo (D, E). Sau cờ `p0_reports`. */
export default async function SchedulesPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p0_reports');
  requirePermission(pc, 'reports.manage');
  const t = await getTranslations('schedules');
  const tr = await getTranslations('reports');
  const [items, clients] = await Promise.all([listSchedules(pc.ctx), listClients(pc.ctx)]);
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="r" href="/reports" className="hover:text-fg">
            {tr('title')}
          </Link>,
          t('title'),
        ]}
        title={t('title')}
      />
      {clients.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock />} title={t('emptyTitle')} description={tr('new.noClients')} />
        </Card>
      ) : (
        <ScheduleManager
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          items={items.map((s) => ({
            id: s.id,
            clientId: s.clientId,
            clientName: s.clientName,
            cadence: s.cadence,
            weekday: s.weekday,
            monthDay: s.monthDay,
            sendHour: s.sendHour,
            timezone: s.timezone,
            mode: s.mode,
            delivery: s.delivery,
            locale: s.locale as 'vi' | 'en' | null,
            recipients: s.recipients,
            enabled: s.enabled,
            deliveries: s.deliveries.map((d) => ({
              id: d.id,
              period: d.period,
              status: d.status,
              reason: d.reason,
              reportId: d.reportId,
            })),
          }))}
        />
      )}
    </>
  );
}
