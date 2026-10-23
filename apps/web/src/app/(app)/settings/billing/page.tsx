import { getTranslations } from 'next-intl/server';
import { Card, EmptyState } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';

/** ST03 Gói & thanh toán — đầy đủ ở feature 026–028. */
export default async function BillingPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'billing.manage');
  const t = await getTranslations();
  return (
    <Card>
      <EmptyState title={t('settings.billing')} description={t('placeholder.comingSoon')} />
    </Card>
  );
}
