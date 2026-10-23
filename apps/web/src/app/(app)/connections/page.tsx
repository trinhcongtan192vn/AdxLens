import { Plug } from 'lucide-react';
import { getFormatter, getNow, getTranslations } from 'next-intl/server';
import { listAdAccounts, listConnections } from '@adxlens/core/connections';
import {
  Badge,
  Banner,
  buttonVariants,
  Card,
  EmptyState,
  PageHeader,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { maskAccountId, tokenState } from '@/lib/format';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('connections') };
}

const AUTHORIZE = '/api/v1/connections/meta/authorize?scope=read';

/** S02 Kết nối (D, E, X token hết hạn) — Penpot. */
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const pc = await getPageContext();
  requirePermission(pc, 'connections.manage');
  const t = await getTranslations('connect');
  const format = await getFormatter();
  const now = await getNow();
  const { error } = await searchParams;
  const [connections, accounts] = await Promise.all([listConnections(pc.ctx), listAdAccounts(pc.ctx)]);
  const byConn = new Map(connections.map((c) => [c.id, tokenState(c.status, c.expiresAt, now)]));
  const expired = [...byConn.values()].filter((s) => s.kind === 'expired').length;
  const expiring = [...byConn.values()].filter((s) => s.kind === 'expiring').length;

  const lastSync = (d: Date | null) => {
    if (!d) return '—';
    const sameDay = format.dateTime(d, { dateStyle: 'short' }) === format.dateTime(now, { dateStyle: 'short' });
    return sameDay
      ? t('todayAt', { time: format.dateTime(d, { hour: '2-digit', minute: '2-digit' }) })
      : format.dateTime(d, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-4">
            {t('s02Title')}
            <a href="/connections/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
              {t('connectAccount')}
            </a>
          </span>
        }
      />
      {error ? (
        <Banner tone="danger" className="mb-3">
          {t(`errors.${['denied', 'missing_scope'].includes(error) ? error : 'failed'}`)}
        </Banner>
      ) : null}
      {expired || expiring ? (
        <Banner tone="warning" className="mb-3">
          {t('tokenSummary', { expired, expiring })}
        </Banner>
      ) : null}

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plug />}
            title={t('s02EmptyTitle')}
            description={t('s02EmptyBody')}
            action={
              <a href="/connections/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
                {t('connectAccount')}
              </a>
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.adAccount')}</TH>
                  <TH>{t('cols.client')}</TH>
                  <TH>{t('cols.token')}</TH>
                  <TH>{t('cols.lastSync')}</TH>
                  <TH>{t('cols.timezone')}</TH>
                  <TH>{t('cols.currency')}</TH>
                  <TH>{t('cols.active30d')}</TH>
                  <TH className="w-28" />
                </tr>
              </THead>
              <TBody>
                {accounts.map((a) => {
                  const st = byConn.get(a.connectionId) ?? { kind: 'valid' as const };
                  return (
                    <TR key={a.id}>
                      <TD title={a.metaAccountId}>{maskAccountId(a.metaAccountId)}</TD>
                      <TD>
                        {a.clientName ?? (
                          <span className="text-fg-tertiary">
                            {t('suggested', { name: a.suggestedClientName ?? a.name })}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {st.kind === 'expired' ? (
                          <Badge tone="danger">{t('token.expired')}</Badge>
                        ) : st.kind === 'expiring' ? (
                          <Badge tone="warning">{t('token.expiring', { days: st.days })}</Badge>
                        ) : (
                          <Badge tone="success">{t('token.valid')}</Badge>
                        )}
                      </TD>
                      <TD>{lastSync(a.lastSyncedAt)}</TD>
                      <TD>{a.timezone}</TD>
                      <TD>{a.currency}</TD>
                      <TD>
                        <Badge tone={a.active30d ? 'success' : 'neutral'}>{a.active30d ? t('yes') : t('no')}</Badge>
                      </TD>
                      <TD className="text-right">
                        {st.kind !== 'valid' ? (
                          <a
                            href={AUTHORIZE}
                            className={buttonVariants({
                              kind: st.kind === 'expired' ? 'primary' : 'secondary',
                              size: 's',
                            })}
                          >
                            {t('reconnect')}
                          </a>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <SourceFootnote className="mt-2">{t('footnote')}</SourceFootnote>
        </>
      )}
    </>
  );
}
