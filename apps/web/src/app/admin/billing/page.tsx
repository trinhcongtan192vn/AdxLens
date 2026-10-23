import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { adminPlans, billingOverview } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { AdminAction } from '../admin-action';

export async function generateMetadata() {
  const t = await getTranslations('admin.billing');
  return { title: t('title') };
}

/** Thanh toán (staff xem; superadmin sửa gói). Quyền của gói chỉ xem — không sửa từ admin. */
export default async function AdminBillingPage() {
  const { staff } = await requireStaff();
  const t = await getTranslations('admin.billing');
  const format = await getFormatter();
  const db = deps().db;
  const [plans, o] = await Promise.all([adminPlans(db), billingOverview(db)]);
  const isSuper = staff.role === 'superadmin';
  const vnd = (v: string | number) => `${format.number(Number(v))} đ`;
  const dt = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: 'short', timeStyle: 'short' }) : '—');
  return (
    <>
      <PageHeader title={t('title')} />
      <Card className="mb-4">
        <CardHeader title={t('plansTitle')} />
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.plan')}</TH>
              <TH numeric>{t('cols.priceVnd')}</TH>
              <TH numeric>{t('cols.priceUsd')}</TH>
              <TH numeric>{t('cols.included')}</TH>
              <TH numeric>{t('cols.extra')}</TH>
              <TH>{t('cols.entitlements')}</TH>
              {isSuper ? <TH /> : null}
            </tr>
          </THead>
          <TBody>
            {plans.map((p) => (
              <TR key={p.key} data-testid={`plan-${p.key}`}>
                <TD className="font-medium">
                  {p.key}
                  {p.fromDb ? null : <span className="block text-small text-fg-tertiary">{t('defaultConfig')}</span>}
                </TD>
                <TD numeric>{vnd(p.monthlyPriceVnd)}</TD>
                <TD numeric>{p.monthlyPriceUsd === null ? '—' : `$${p.monthlyPriceUsd}`}</TD>
                <TD numeric>{p.includedAccounts}</TD>
                <TD numeric>{vnd(p.extraAccountVnd)}</TD>
                <TD muted className="text-small">
                  {p.entitlements.join(', ')}
                </TD>
                {isSuper ? (
                  <TD>
                    <AdminAction
                      testId={`edit-plan-${p.key}`}
                      label={t('edit')}
                      title={t('editTitle', { plan: p.key })}
                      method="PATCH"
                      path={`admin/billing/plans/${p.key}`}
                      done={t('saved')}
                      fields={[
                        {
                          name: 'monthly_price_vnd',
                          label: t('cols.priceVnd'),
                          kind: 'number',
                          initial: String(p.monthlyPriceVnd),
                        },
                        {
                          name: 'monthly_price_usd',
                          label: t('cols.priceUsd'),
                          kind: 'text',
                          as: 'nullableString',
                          initial: p.monthlyPriceUsd === null ? '' : String(p.monthlyPriceUsd),
                        },
                        {
                          name: 'included_accounts',
                          label: t('cols.included'),
                          kind: 'number',
                          as: 'int',
                          initial: String(p.includedAccounts),
                        },
                        {
                          name: 'extra_account_vnd',
                          label: t('cols.extra'),
                          kind: 'number',
                          initial: String(p.extraAccountVnd),
                        },
                      ]}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="px-4 py-3 text-small text-fg-tertiary">{t('entitlementsNote')}</p>
      </Card>

      <Card className="mb-4">
        <CardHeader title={t('attentionTitle', { count: o.attention.length })} />
        {o.attention.length === 0 ? (
          <EmptyState title={t('attentionEmpty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.plan')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH>{t('cols.since')}</TH>
              </tr>
            </THead>
            <TBody>
              {o.attention.map((a) => (
                <TR key={a.workspaceId}>
                  <TD>
                    <Link href={`/admin/workspaces/${a.workspaceId}`} className="text-link hover:underline">
                      {a.workspaceName}
                    </Link>
                  </TD>
                  <TD>
                    {a.planKey} · {a.provider}
                  </TD>
                  <TD>
                    {a.status === 'past_due' ? <Badge tone="danger">{t('pastDue')}</Badge> : null}{' '}
                    {a.overLimitSince ? <Badge tone="warning">{t('overLimit')}</Badge> : null}
                  </TD>
                  <TD muted>{dt(a.pastDueSince ?? a.overLimitSince)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('ordersTitle')} />
          {o.orders.length === 0 ? (
            <EmptyState title={t('none')} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.workspace')}</TH>
                  <TH>{t('cols.order')}</TH>
                  <TH numeric>{t('cols.amount')}</TH>
                  <TH>{t('cols.status')}</TH>
                </tr>
              </THead>
              <TBody>
                {o.orders.map((x) => (
                  <TR key={x.id}>
                    <TD>{x.workspaceName}</TD>
                    <TD muted>
                      #{x.orderCode} · {x.planKey} · {x.period}
                      <span className="block text-small">{dt(x.paidAt ?? x.createdAt)}</span>
                    </TD>
                    <TD numeric>{vnd(x.amountVnd)}</TD>
                    <TD>
                      <Badge tone={x.status === 'paid' ? 'success' : x.status === 'pending' ? 'warning' : 'neutral'}>
                        {x.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t('eventsTitle')} />
          {o.events.length === 0 ? (
            <EmptyState title={t('none')} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.at')}</TH>
                  <TH>{t('cols.event')}</TH>
                  <TH>{t('cols.workspace')}</TH>
                </tr>
              </THead>
              <TBody>
                {o.events.map((e) => (
                  <TR key={e.id}>
                    <TD muted>{dt(e.createdAt)}</TD>
                    <TD className="font-mono text-small">
                      {e.provider} · {e.type}
                    </TD>
                    <TD muted>{e.workspaceName ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
