import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { schema } from '@adxlens/db';
import { incidentDetail, listIncidents } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, cn, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { IncidentActions } from './incident-actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.incidents');
  return { title: t('title') };
}

const SEV_TONE = { P1: 'danger', P2: 'warning', P3: 'neutral' } as const;
const STATUS_TONE = { open: 'danger', mitigated: 'warning', resolved: 'success' } as const;

function chip(active: boolean) {
  return cn(
    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
    active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
  );
}

/** AD03 Sự cố & playbook (L3 19): danh sách sự cố, chi tiết + lần chạy playbook, đánh dấu giảm thiểu / xử lý. */
export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string }>;
}) {
  await requireStaff();
  const t = await getTranslations('admin.incidents');
  const format = await getFormatter();
  const q = await searchParams;
  const status = (schema.INCIDENT_STATUSES as readonly string[]).includes(q.status ?? '')
    ? (q.status as (typeof schema.INCIDENT_STATUSES)[number])
    : undefined;
  const db = deps().db;
  const items = await listIncidents(db, { status: status ? [status] : undefined });
  const selected = q.id && /^[0-9a-f-]{36}$/.test(q.id) ? await incidentDetail(db, q.id) : null;
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/admin/incidents" className={chip(!status)}>
          {t('all')}
        </Link>
        {schema.INCIDENT_STATUSES.map((s) => (
          <Link key={s} href={`/admin/incidents?status=${s}`} className={chip(status === s)}>
            {t(`status.${s}`)}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {items.length === 0 ? (
          <Card>
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('cols.severity')}</TH>
                  <TH>{t('cols.title')}</TH>
                  <TH numeric>{t('cols.occurrences')}</TH>
                  <TH>{t('cols.status')}</TH>
                  <TH>{t('cols.opened')}</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((i) => (
                  <TR key={i.id} data-testid="incident-row">
                    <TD>
                      <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/incidents?${new URLSearchParams({ ...(status ? { status } : {}), id: i.id })}`}
                        className="font-medium text-fg hover:underline"
                      >
                        {i.title}
                      </Link>
                      <span className="block text-small text-fg-secondary">{i.kind}</span>
                    </TD>
                    <TD numeric>{i.occurrences}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[i.status]}>{t(`status.${i.status}`)}</Badge>
                    </TD>
                    <TD muted>{when(i.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
        {selected ? (
          <Card data-testid="incident-detail">
            <CardHeader
              title={t('detail')}
              actions={
                selected.status !== 'resolved' ? <IncidentActions id={selected.id} status={selected.status} /> : null
              }
            />
            <div className="flex flex-col gap-2 px-4 py-4 text-body">
              <p className="font-medium text-fg">{selected.title}</p>
              <p className="text-small text-fg-secondary">
                {selected.kind} · {selected.source} · {selected.fingerprint}
              </p>
              <pre className="max-h-48 overflow-auto rounded-md bg-subtle p-2 text-small text-fg">
                {JSON.stringify(selected.detail, null, 2)}
              </pre>
              <h3 className="mt-2 font-semibold text-fg">{t('runs')}</h3>
              {selected.runs.length === 0 ? (
                <p className="text-small text-fg-secondary">{t('noRuns')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-small">
                  {selected.runs.map((r) => (
                    <li key={r.id}>
                      {when(r.at)} · {r.playbook} · {t(`runResult.${r.result}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
