import { getFormatter, getTranslations } from 'next-intl/server';
import { getGlobalKillSwitch } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, PageHeader } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { GlobalKillSwitchForm } from './global-form';

export async function generateMetadata() {
  const t = await getTranslations('admin.killSwitch');
  return { title: t('title') };
}

/** AD04 Kill switch toàn cục (staff xem, PM bật/tắt; CLI dự phòng `pnpm killswitch`). */
export default async function AdminKillSwitchPage() {
  const { staff } = await requireStaff();
  const t = await getTranslations('admin.killSwitch');
  const format = await getFormatter();
  const k = await getGlobalKillSwitch(deps().db);
  return (
    <>
      <PageHeader title={t('title')} />
      <Card className="max-w-[720px]">
        <CardHeader
          title={t('state')}
          actions={
            <Badge tone={k.active ? 'danger' : 'success'} data-testid="global-kill-state">
              {k.active ? t('on') : t('off')}
            </Badge>
          }
        />
        <div className="flex flex-col gap-3 px-4 py-4 text-body">
          <p className="text-fg-secondary">{t('body')}</p>
          {k.reason ? (
            <p className="text-fg">
              {k.reason}
              {k.changedAt ? ` · ${format.dateTime(k.changedAt, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
            </p>
          ) : null}
          {staff.canEnableFlags ? (
            <GlobalKillSwitchForm active={k.active} />
          ) : (
            <p className="text-fg-secondary">{t('pmOnly')}</p>
          )}
        </div>
      </Card>
    </>
  );
}
