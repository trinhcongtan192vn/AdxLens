import { getLocale, getTranslations } from 'next-intl/server';
import { BUSINESS_METRICS, businessDashboard, type BusinessBlock } from '@adxlens/core/reporting';
import { Card, cn } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric, formatPct, LOWER_IS_BETTER } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { CopyLinkButton } from './copy-link-button';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.business') };
}

const KEYS = [...BUSINESS_METRICS, 'aov'] as const;
/** Ô cần nguồn đơn hàng ngoài Meta (Shopify / web) — chưa kết nối nên chỉ giải thích. */
const NEEDS_STORE = ['netProfit', 'mer', 'cac', 'ltv'] as const;

/**
 * Business Dashboard (Madgicx 3.3): Blended summary của phạm vi + khối theo từng tài khoản QC. Chỉ số từ Meta; các ô
 * cần dữ liệu cửa hàng ghi rõ "cần nguồn đơn hàng".
 */
export default async function BusinessPage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsBusiness');
  const tw = await getTranslations('ws');
  const tm = await getTranslations('metrics');
  const locale = await getLocale();
  const data = await businessDashboard(pc.ctx, scope.ids, scope.cur, scope.prev);
  const label = (k: (typeof KEYS)[number]) => (k === 'aov' ? t('aov') : tm(`${k}.name`));
  const metricKey = (k: (typeof KEYS)[number]) => (k === 'aov' ? 'purchase_value' : k);

  const tiles = (b: BusinessBlock, currency: string | null, testid?: string) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7" data-testid={testid}>
      {KEYS.map((k) => {
        const ch = b.changes[k];
        const good = ch == null ? null : LOWER_IS_BETTER.has(metricKey(k)) ? ch < 0 : ch > 0;
        return (
          <div key={k} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-caption text-fg-tertiary">{label(k)}</p>
            <p className="num mt-1 text-h4 font-semibold text-fg">
              {formatMetric(metricKey(k), b.values[k], currency, locale, { compact: true })}
            </p>
            <p
              className={cn(
                'num text-caption',
                good == null ? 'text-fg-tertiary' : good ? 'text-success' : 'text-danger',
              )}
            >
              {formatPct(ch, locale)}
            </p>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <WsHeader
        title={tw('nav.business')}
        subtitle={t('subtitle', { from: scope.cur.from, to: scope.cur.to })}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-h4 font-semibold text-fg">{t('blended')}</h2>
          <CopyLinkButton label={t('share')} copied={t('copied')} />
        </div>
        {tiles(data.blended, scope.currency, 'business-blended')}
        {scope.excludedOtherCurrency ? (
          <p className="mt-2 text-caption text-fg-tertiary">{t('otherCurrency', { n: scope.excludedOtherCurrency })}</p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {NEEDS_STORE.map((k) => (
            <div key={k} className="rounded-lg border border-dashed border-line p-3">
              <p className="text-caption text-fg-tertiary">{t(`store.${k}`)}</p>
              <p className="mt-1 text-caption text-fg-secondary">{t('needsStore')}</p>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mb-2 mt-5 text-h4 font-semibold text-fg">{t('byAccount')}</h2>
      <div className="flex flex-col gap-3" data-testid="business-accounts">
        {data.accounts.map((a) => (
          <Card key={a.id}>
            <p className="mb-2 text-small font-semibold text-fg">
              {a.name}
              {a.clientName ? <span className="ml-2 font-normal text-fg-tertiary">· {a.clientName}</span> : null}
              <span className="ml-2 text-caption font-normal text-fg-tertiary">{a.currency}</span>
            </p>
            {tiles(a.block, a.currency)}
          </Card>
        ))}
      </div>
    </>
  );
}
