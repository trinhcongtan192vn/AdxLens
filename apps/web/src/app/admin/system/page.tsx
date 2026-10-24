import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getEnv } from '@adxlens/config/env';
import { maintenanceNotice, opsAlertEmails, systemHealth } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { queueAdmin } from '@/server/queue-admin';
import { AdminAction } from '../admin-action';

export async function generateMetadata() {
  const t = await getTranslations('admin.system');
  return { title: t('title') };
}

/** Hệ thống: phiên bản, kiểm thực thi, sự cố mở, lịch định kỳ, kênh cảnh báo đội, thông báo bảo trì. */
export default async function AdminSystemPage() {
  const { staff } = await requireStaff();
  const t = await getTranslations('admin.system');
  const format = await getFormatter();
  const env = getEnv();
  const db = deps().db;
  const schedules = await queueAdmin()
    .schedules()
    .catch(() => null);
  const [h, emails, notice] = await Promise.all([
    systemHealth(db, { appVersion: env.APP_VERSION, schedules }),
    opsAlertEmails(db),
    maintenanceNotice(db),
  ]);
  const isSuper = staff.role === 'superadmin';
  const dt = (v: Date | string | null) =>
    v ? format.dateTime(new Date(v), { dateStyle: 'short', timeStyle: 'short' }) : '—';
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('healthTitle')} />
          <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-body">
            <dt className="text-fg-secondary">{t('version')}</dt>
            <dd className="font-mono">{h.appVersion}</dd>
            <dt className="text-fg-secondary">{t('executionCheck')}</dt>
            <dd>
              {h.executionCheck ? (
                <Badge tone={h.executionCheck.passed ? 'success' : 'danger'}>
                  {h.executionCheck.passed ? t('passed') : t('failed')} · {h.executionCheck.appEnv} ·{' '}
                  {dt(h.executionCheck.ranAt)}
                </Badge>
              ) : (
                <span className="text-fg-tertiary">{t('notRun')}</span>
              )}
            </dd>
            <dt className="text-fg-secondary">{t('incidents')}</dt>
            <dd>
              <Link href="/admin/incidents" className="text-link hover:underline">
                P1 {h.openIncidents.P1} · P2 {h.openIncidents.P2} · P3 {h.openIncidents.P3}
              </Link>
            </dd>
            <dt className="text-fg-secondary">{t('smoke')}</dt>
            <dd>
              {h.deploySmoke ? (
                <Badge tone={h.deploySmoke.status === 'resolved' ? 'success' : 'danger'}>
                  {h.deploySmoke.status === 'resolved' ? t('smokeOk') : t('smokeFailed')} ·{' '}
                  {dt(h.deploySmoke.createdAt)}
                </Badge>
              ) : (
                <span className="text-fg-tertiary">{t('smokeNone')}</span>
              )}
            </dd>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title={t('alertsTitle')}
            actions={
              isSuper ? (
                <AdminAction
                  testId="edit-alert-emails"
                  label={t('edit')}
                  title={t('alertsTitle')}
                  method="PUT"
                  path="admin/system/alert-emails"
                  done={t('saved')}
                  fields={[
                    {
                      name: 'emails',
                      label: t('emailsLabel'),
                      kind: 'textarea',
                      as: 'lines',
                      initial: emails.join('\n'),
                    },
                  ]}
                />
              ) : null
            }
          />
          <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-body">
            <dt className="text-fg-secondary">{t('emails')}</dt>
            <dd data-testid="alert-emails">{emails.length ? emails.join(', ') : '—'}</dd>
            <dt className="text-fg-secondary">{t('envEmails')}</dt>
            <dd>{env.OPS_ALERT_EMAILS ? t('yes') : t('no')}</dd>
            <dt className="text-fg-secondary">{t('slack')}</dt>
            <dd>{env.OPS_SLACK_WEBHOOK_URL ? t('configured') : t('notConfigured')}</dd>
          </dl>
          <p className="px-4 pb-3 text-small text-fg-tertiary">{t('alertsNote')}</p>
        </Card>
      </div>

      <Card className="my-4">
        <CardHeader
          title={t('maintenanceTitle')}
          actions={
            isSuper ? (
              <AdminAction
                testId="edit-maintenance"
                label={t('edit')}
                title={t('maintenanceTitle')}
                method="PUT"
                path="admin/system/maintenance"
                done={t('saved')}
                fields={[
                  { name: 'active', label: t('maintenanceActive'), kind: 'checkbox', initial: notice?.active ?? false },
                  { name: 'message_vi', label: t('messageVi'), kind: 'textarea', initial: notice?.messageVi ?? '' },
                  { name: 'message_en', label: t('messageEn'), kind: 'textarea', initial: notice?.messageEn ?? '' },
                  { name: 'ends_at', label: t('endsAt'), kind: 'datetime', as: 'isoOrNull' },
                ]}
              />
            ) : null
          }
        />
        <div className="px-4 py-3 text-body" data-testid="maintenance-state">
          {notice?.active ? (
            <>
              <Badge tone="info">{t('maintenanceOn')}</Badge> {notice.messageVi}
              <span className="block text-small text-fg-tertiary">
                {notice.endsAt ? t('until', { at: dt(notice.endsAt) }) : t('untilOff')}
              </span>
            </>
          ) : (
            <span className="text-fg-tertiary">{t('maintenanceOff')}</span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('schedulesTitle')} />
        {h.schedules === null ? (
          <p className="px-4 py-3 text-body text-danger">{t('redisDown')}</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.job')}</TH>
                <TH>{t('cols.when')}</TH>
                <TH>{t('cols.next')}</TH>
              </tr>
            </THead>
            <TBody>
              {h.schedules.map((s) => (
                <TR key={`${s.queue}:${s.name}`}>
                  <TD className="font-mono text-small">{s.name}</TD>
                  <TD muted className="font-mono text-small">
                    {s.pattern ?? (s.everyMs ? t('every', { minutes: Math.round(s.everyMs / 60000) }) : '—')}
                  </TD>
                  <TD>
                    {dt(s.next)} {s.late ? <Badge tone="danger">{t('late')}</Badge> : null}
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
