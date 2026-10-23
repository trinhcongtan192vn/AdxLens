import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hasPlanEntitlement } from '@adxlens/core/billing';
import { listWriteAccess } from '@adxlens/core/connections';
import { Badge, Banner, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { WriteAccessActions } from './write-access-actions';

export async function generateMetadata() {
  const t = await getTranslations('writeAccess');
  return { title: t('title') };
}

/**
 * P201 Nâng quyền ghi Meta (P2-01): giải thích AdxLens sẽ làm gì khi có quyền ghi, OAuth nâng quyền, bật /
 * thu hồi theo từng kết nối. Owner; sau cờ duyệt hành động; gói Growth trở lên (ADR-0001 A6).
 */
export default async function WriteAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  requirePermission(pc, 'write_scope.manage');
  const t = await getTranslations('writeAccess');
  const tc = await getTranslations('nav');
  const q = await searchParams;
  const [rows, planOk] = await Promise.all([listWriteAccess(pc.ctx), hasPlanEntitlement(pc.ctx, 'write_actions')]);
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="c" href="/connections" className="hover:text-fg">
            {tc('connections')}
          </Link>,
          t('title'),
        ]}
        title={t('title')}
      />
      {q.done ? (
        <Banner tone="success" className="mb-4">
          {t('done')}
        </Banner>
      ) : null}
      {q.error === 'missing_scope' ? (
        <Banner tone="warning" className="mb-4">
          {t('missingScope')}
        </Banner>
      ) : null}
      {!planOk ? (
        <Banner
          tone="info"
          className="mb-4"
          action={
            <Link href="/settings/billing" className="text-body font-medium underline">
              {t('upgrade')}
            </Link>
          }
        >
          {t('planRequired')}
        </Banner>
      ) : null}
      <Card className="mb-4 px-4 py-4">
        <h2 className="text-h3 font-semibold text-fg">{t('whatTitle')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-fg">
          <li>{t('what.approve')}</li>
          <li>{t('what.actions')}</li>
          <li>{t('what.guardrails')}</li>
          <li>{t('what.revoke')}</li>
        </ul>
      </Card>
      <Card>
        <CardHeader title={t('connections')} />
        {rows.length === 0 ? (
          <EmptyState title={t('noConnections')} description={t('noConnectionsBody')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('cols.connection')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH className="text-right">{t('cols.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} data-testid="write-access-row">
                  <TD>{r.metaUserName ?? r.id}</TD>
                  <TD>
                    {r.isDemo ? (
                      <Badge tone="neutral">{t('state.demo')}</Badge>
                    ) : r.writeEnabled && r.hasWriteScope ? (
                      <Badge tone="success">{t('state.enabled')}</Badge>
                    ) : r.hasWriteScope ? (
                      <Badge tone="warning">{t('state.revoked')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('state.readOnly')}</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {r.isDemo || r.status !== 'active' ? null : (
                      <WriteAccessActions
                        connectionId={r.id}
                        enabled={r.writeEnabled && r.hasWriteScope}
                        hasScope={r.hasWriteScope}
                        canGrant={planOk}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
