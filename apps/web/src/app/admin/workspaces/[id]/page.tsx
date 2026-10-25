import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { adminWorkspaceDetail } from '@adxlens/core/ops';
import { isAppError } from '@adxlens/core/shared';
import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { FLAG_LABEL } from '@/lib/admin';
import { AdminAction } from '../../admin-action';
import { ResyncButton } from '../../operations/ops-actions';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';

export async function generateMetadata() {
  const t = await getTranslations('admin.workspaces');
  return { title: t('detailTitle') };
}

const UUID = /^[0-9a-f-]{36}$/;

/** Chi tiết workspace cho hỗ trợ khách (chỉ thông tin vận hành; không token, không số liệu quảng cáo). */
export default async function AdminWorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations('admin.workspaces');
  const tf = await getTranslations('admin.flags');
  const format = await getFormatter();
  const d = await adminWorkspaceDetail(deps().db, id).catch((e) => {
    if (isAppError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const dt = (v: Date | string | null) =>
    v ? format.dateTime(new Date(v), { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const flagOn = new Map(d.flags.map((f) => [f.key, f.enabled]));

  return (
    <>
      <PageHeader title={d.workspace.name} />
      <p className="mb-4 text-small text-fg-tertiary">
        <Link href="/admin/workspaces" className="text-link hover:underline">
          {t('back')}
        </Link>{' '}
        · <span className="font-mono">{d.workspace.id}</span> · {t('createdAt', { at: dt(d.workspace.createdAt) })}
      </p>

      {/* Mục lục: nhảy tới từng phần khi hỗ trợ khách (trang dài). */}
      <nav
        aria-label={t('toc.label')}
        className="sticky top-12 z-10 -mx-6 mb-4 flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-canvas px-6 py-2 text-body"
      >
        {(
          [
            ['billing', t('toc.billing')],
            ['flags', t('toc.flags')],
            ['members', t('toc.members', { count: d.members.length })],
            ['connections', t('toc.connections', { count: d.connections.length })],
            ['accounts', t('toc.accounts', { count: d.accounts.length })],
            ['sync-runs', t('toc.syncRuns')],
            ['incidents', t('toc.incidents', { count: d.incidents.length })],
            ['deletions', t('toc.deletions', { count: d.deletions.length })],
          ] as const
        ).map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-fg-secondary hover:text-fg">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="billing" title={t('sections.billing')}>
          <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-body">
            <dt className="text-fg-secondary">{t('billing.plan')}</dt>
            <dd>
              {d.billing.plan}
              {d.billing.subscribedPlan !== d.billing.plan
                ? ` (${t('billing.subscribed', { plan: d.billing.subscribedPlan })})`
                : ''}
            </dd>
            <dt className="text-fg-secondary">{t('billing.status')}</dt>
            <dd>
              <Badge tone={d.billing.status === 'active' ? 'success' : 'warning'}>{d.billing.status}</Badge> ·{' '}
              {d.billing.provider}
            </dd>
            <dt className="text-fg-secondary">{t('billing.accounts')}</dt>
            <dd>
              {d.billing.activeAccounts}/{d.billing.accountLimit}
              {d.billing.overLimit ? (
                <Badge tone="danger" className="ml-2">
                  {t('billing.overLimit')}
                </Badge>
              ) : null}
            </dd>
            <dt className="text-fg-secondary">{t('billing.periodEnd')}</dt>
            <dd>{dt(d.billing.currentPeriodEnd)}</dd>
            <dt className="text-fg-secondary">{t('billing.grace')}</dt>
            <dd>{dt(d.billing.graceUntil)}</dd>
          </dl>
          {staff.role === 'superadmin' ? (
            <div className="flex gap-2 px-4 pb-3">
              <AdminAction
                testId="comp-plan"
                label={t('billing.comp')}
                title={t('billing.compTitle', { workspace: d.workspace.name })}
                path={`admin/workspaces/${d.workspace.id}/billing`}
                base={{ action: 'comp' }}
                done={t('billing.saved')}
                fields={[
                  {
                    name: 'plan',
                    label: t('billing.plan'),
                    kind: 'select',
                    initial: d.billing.subscribedPlan,
                    options: ['free', 'starter', 'growth', 'scale'].map((k) => ({ value: k, label: k })),
                  },
                ]}
              />
              {d.billing.graceUntil ? (
                <AdminAction
                  testId="extend-grace"
                  label={t('billing.extendGrace')}
                  title={t('billing.extendTitle', { workspace: d.workspace.name })}
                  path={`admin/workspaces/${d.workspace.id}/billing`}
                  base={{ action: 'extend_grace' }}
                  done={t('billing.saved')}
                  fields={[{ name: 'days', label: t('billing.days'), kind: 'number', as: 'int', initial: '7' }]}
                />
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section id="flags" title={t('sections.flags')}>
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {Object.keys(FLAG_LABEL).map((k) => (
              <li key={k}>
                <Badge tone={flagOn.get(k as never) ? 'success' : 'neutral'}>
                  {tf(`names.${FLAG_LABEL[k]}`)}: {flagOn.get(k as never) ? tf('on') : tf('off')}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-small">
            <Link href={`/admin/flags?q=${encodeURIComponent(d.workspace.name)}`} className="text-link hover:underline">
              {t('openFlags')}
            </Link>
          </p>
        </Section>
      </div>

      <Section id="members" title={t('sections.members', { count: d.members.length })}>
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.email')}</TH>
              <TH>{t('cols.name')}</TH>
              <TH>{t('cols.role')}</TH>
              {staff.role === 'superadmin' ? <TH /> : null}
            </tr>
          </THead>
          <TBody>
            {d.members.map((m) => (
              <TR key={m.userId}>
                <TD>{m.email}</TD>
                <TD muted>{m.fullName ?? '—'}</TD>
                <TD>{m.role}</TD>
                {staff.role === 'superadmin' ? (
                  <TD>
                    {/* Owner: xóa workspace hoặc chuyển quyền Owner trước (core chặn lại ở server). */}
                    {m.role === 'owner' ? null : (
                      <AdminAction
                        testId={`delete-user-${m.userId}`}
                        kind="danger"
                        label={t('danger.deleteUser')}
                        title={t('danger.deleteUserTitle', { email: m.email })}
                        intro={t('danger.deleteUserIntro')}
                        path={`admin/users/${m.userId}/delete`}
                        done={t('danger.userDeleted')}
                        fields={[{ name: 'confirm', label: t('danger.typeEmail', { email: m.email }), kind: 'text' }]}
                      />
                    )}
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section id="connections" title={t('sections.connections', { count: d.connections.length })}>
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.metaUser')}</TH>
              <TH>{t('cols.status')}</TH>
              <TH>{t('cols.expires')}</TH>
              <TH>{t('cols.write')}</TH>
              <TH>{t('cols.created')}</TH>
            </tr>
          </THead>
          <TBody>
            {d.connections.map((c) => (
              <TR key={c.id}>
                <TD>
                  {c.metaUserName ?? '—'}
                  {c.isDemo ? <Badge className="ml-2">{t('demo')}</Badge> : null}
                </TD>
                <TD>
                  <Badge tone={c.status === 'active' ? 'success' : c.status === 'revoked' ? 'neutral' : 'danger'}>
                    {c.status}
                  </Badge>
                </TD>
                <TD muted>{dt(c.expiresAt)}</TD>
                <TD>{c.writeEnabled ? t('yes') : t('no')}</TD>
                <TD muted>{dt(c.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section id="accounts" title={t('sections.accounts', { count: d.accounts.length })}>
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.account')}</TH>
              <TH>{t('cols.client')}</TH>
              <TH>{t('cols.sync')}</TH>
              <TH>{t('cols.lastSync')}</TH>
              <TH>{t('cols.recon')}</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {d.accounts.map((a) => (
              <TR key={a.id} data-testid={`admin-account-${a.metaAccountId}`}>
                <TD>
                  <span className="font-medium">{a.name}</span>
                  <span className="block font-mono text-small text-fg-tertiary">
                    {a.metaAccountId} · {a.timezone} · {a.currency}
                  </span>
                  {a.connectionStatus === 'revoked' ? <Badge className="mt-1">{t('pendingDeletion')}</Badge> : null}
                </TD>
                <TD muted>
                  {a.clientName ?? '—'} · {a.assignmentStatus}
                </TD>
                <TD>
                  <Badge
                    tone={
                      a.syncStatus === 'error' || a.syncStatus === 'no_access'
                        ? 'danger'
                        : a.syncStatus === 'ok'
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {a.syncStatus}
                  </Badge>
                </TD>
                <TD muted>{dt(a.lastSyncedAt)}</TD>
                <TD>
                  {a.reconciliation30d.days === 0
                    ? '—'
                    : t('reconSummary', { warnings: a.reconciliation30d.warnings, days: a.reconciliation30d.days })}
                </TD>
                <TD>{a.connectionStatus === 'revoked' ? null : <ResyncButton adAccountId={a.id} label={a.name} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section id="sync-runs" title={t('sections.syncRuns')}>
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.kind')}</TH>
              <TH>{t('cols.range')}</TH>
              <TH>{t('cols.status')}</TH>
              <TH>{t('cols.started')}</TH>
              <TH>{t('cols.error')}</TH>
            </tr>
          </THead>
          <TBody>
            {d.syncRuns.map((r) => (
              <TR key={r.id}>
                <TD>{r.kind}</TD>
                <TD muted>
                  {r.dateFrom} → {r.dateTo}
                </TD>
                <TD>
                  <Badge tone={r.status === 'failed' ? 'danger' : r.status === 'succeeded' ? 'success' : 'warning'}>
                    {r.status}
                  </Badge>
                </TD>
                <TD muted>{dt(r.startedAt)}</TD>
                <TD muted className="font-mono text-small">
                  {r.error ?? '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="incidents" title={t('sections.incidents', { count: d.incidents.length })}>
          <ul className="divide-y divide-line text-body">
            {d.incidents.length === 0 ? <li className="px-4 py-3 text-fg-tertiary">{t('none')}</li> : null}
            {d.incidents.map((i) => (
              <li key={i.id} className="px-4 py-2">
                <Badge tone={i.severity === 'P1' ? 'danger' : 'warning'}>{i.severity}</Badge>{' '}
                <Link href={`/admin/incidents?id=${i.id}`} className="text-link hover:underline">
                  {i.title}
                </Link>{' '}
                <span className="text-small text-fg-tertiary">· {dt(i.openedAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section id="deletions" title={t('sections.deletions', { count: d.deletions.length })}>
          <ul className="divide-y divide-line text-body">
            {d.deletions.length === 0 ? <li className="px-4 py-3 text-fg-tertiary">{t('none')}</li> : null}
            {d.deletions.map((x) => (
              <li key={x.id} className="px-4 py-2">
                <span className="font-mono">{x.code}</span> · {x.status} ·{' '}
                {t('purgeAfter', { at: dt(x.completedAt ?? x.purgeAfter) })}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {staff.role === 'superadmin' ? (
        <Card className="mb-4 border-danger" id="danger">
          <CardHeader title={t('danger.title')} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
            <p className="max-w-2xl text-body text-fg-secondary">{t('danger.workspaceBody')}</p>
            <AdminAction
              testId="delete-workspace"
              kind="danger"
              label={t('danger.deleteWorkspace')}
              title={t('danger.deleteWorkspaceTitle', { workspace: d.workspace.name })}
              intro={t('danger.workspaceIntro')}
              path={`admin/workspaces/${d.workspace.id}/delete`}
              done={t('danger.workspaceDeleted')}
              redirectTo="/admin/workspaces"
              fields={[{ name: 'confirm', label: t('danger.typeName', { workspace: d.workspace.name }), kind: 'text' }]}
            />
          </div>
        </Card>
      ) : null}
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card className="mb-4 scroll-mt-16" id={id}>
      <CardHeader title={title} />
      {children}
    </Card>
  );
}
