import { getLocale, getTranslations } from 'next-intl/server';
import { businessDashboard, listBusinessLinks, type BusinessBlock } from '@adxlens/core/reporting';
import { can, listClients } from '@adxlens/core/tenancy';
import { Card } from '@adxlens/ui';
import { BusinessTiles, type BusinessTileKey } from '@/components/business-tiles';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext } from '@/server/page-context';
import { appBaseUrl, currentRequest } from '@/server/public-base';
import { workspaceScope } from '@/server/workspace-scope';
import { BusinessShare } from './business-share';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.business') };
}

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
  const label = (k: BusinessTileKey) => (k === 'aov' ? t('aov') : tm(`${k}.name`));

  const tiles = (b: BusinessBlock, currency: string | null, testid?: string) => (
    <BusinessTiles block={b} currency={currency} locale={locale} label={label} testid={testid} />
  );
  const canShare = can(pc.actor.role, 'reports.manage');
  const [clients, links] = canShare ? await Promise.all([listClients(pc.ctx), listBusinessLinks(pc.ctx)]) : [[], []];
  const base = `${appBaseUrl(await currentRequest())}/b`;

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
          {canShare ? (
            <BusinessShare
              base={base}
              clients={clients.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name }))}
              links={links.map((l) => ({
                id: l.id,
                clientId: l.clientId,
                token: l.token,
                periodDays: l.periodDays,
                hasPassword: Boolean(l.passwordHash),
                expiresAt: l.expiresAt?.toISOString() ?? null,
                revoked: Boolean(l.revokedAt),
                views: l.viewCount,
              }))}
            />
          ) : null}
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
