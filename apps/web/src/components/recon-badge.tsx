import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@adxlens/ui';

/** "Khớp 0,3%" / "Lệch 1,4%" / "Chưa đối chiếu" (S06, C01, C02, D04). */
export function ReconBadge({ status, pct }: { status: 'ok' | 'warning' | 'pending'; pct: string | null }) {
  const t = useTranslations('recon');
  const format = useFormatter();
  if (status === 'pending' || pct === null) return <Badge tone="neutral">{t('pending')}</Badge>;
  const n = Number(pct);
  const label = `${format.number(n, { maximumFractionDigits: n > 0 && n < 0.1 ? 2 : 1 })}%`;
  return <Badge tone={status === 'ok' ? 'success' : 'warning'}>{t(status, { pct: label })}</Badge>;
}
