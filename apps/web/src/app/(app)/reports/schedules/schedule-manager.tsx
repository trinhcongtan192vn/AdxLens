'use client';

import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TR,
} from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { COMMON_TIMEZONES } from '@/lib/timezone';

type Delivery = { id: string; period: string; status: string; reason: string | null; reportId: string | null };
type Item = {
  id: string;
  clientId: string;
  clientName: string;
  cadence: 'weekly' | 'monthly';
  weekday: number | null;
  monthDay: number | null;
  sendHour: number;
  timezone: string;
  mode: 'auto' | 'approval';
  delivery: 'link' | 'pdf';
  locale: 'vi' | 'en' | null;
  recipients: string[];
  enabled: boolean;
  deliveries: Delivery[];
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = {
  sent: 'success',
  pending_approval: 'info',
  approved: 'info',
  postponed: 'warning',
  failed: 'danger',
};

const empty = (clientId: string) => ({
  id: null as string | null,
  clientId,
  cadence: 'weekly' as 'weekly' | 'monthly',
  weekday: 1,
  monthDay: 1,
  sendHour: 9,
  timezone: 'Asia/Ho_Chi_Minh',
  mode: 'auto' as 'auto' | 'approval',
  delivery: 'link' as 'link' | 'pdf',
  locale: '' as '' | 'vi' | 'en',
  recipients: '',
});

/** R05: danh sách lịch, lần gửi gần đây (duyệt & gửi), thêm/sửa/xóa. */
export function ScheduleManager({ items, clients }: { items: Item[]; clients: { id: string; name: string }[] }) {
  const t = useTranslations('schedules');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  const describe = (s: Item) =>
    s.cadence === 'weekly'
      ? t('weekly', { weekday: t(`weekdays.${s.weekday ?? 1}` as never), hour: s.sendHour, timezone: s.timezone })
      : t('monthly', { day: s.monthDay ?? 1, hour: s.sendHour, timezone: s.timezone });

  const save = () => {
    if (!form) return;
    const body = {
      client_id: form.clientId,
      cadence: form.cadence,
      weekday: form.cadence === 'weekly' ? form.weekday : null,
      month_day: form.cadence === 'monthly' ? form.monthDay : null,
      send_hour: form.sendHour,
      timezone: form.timezone,
      mode: form.mode,
      delivery: form.delivery,
      locale: form.locale || null,
      recipients: form.recipients.split(/[,;\s]+/).filter(Boolean),
    };
    run(
      () =>
        api(form.id ? `report-schedules/${form.id}` : 'report-schedules', { method: form.id ? 'PATCH' : 'POST', body }),
      undefined,
      () => setForm(null),
    );
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button kind="primary" size="m" onClick={() => setForm(empty(clients[0]!.id))}>
          {t('add')}
        </Button>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock />} title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id} data-testid={`schedule-${s.id}`}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {s.clientName}
                    <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? t('enabled') : t('disabled')}</Badge>
                  </span>
                }
                actions={
                  <>
                    <Button
                      kind="ghost"
                      size="s"
                      onClick={() =>
                        setForm({
                          id: s.id,
                          clientId: s.clientId,
                          cadence: s.cadence,
                          weekday: s.weekday ?? 1,
                          monthDay: s.monthDay ?? 1,
                          sendHour: s.sendHour,
                          timezone: s.timezone,
                          mode: s.mode,
                          delivery: s.delivery,
                          locale: s.locale ?? '',
                          recipients: s.recipients.join(', '),
                        })
                      }
                    >
                      {t('edit')}
                    </Button>
                    <Button kind="ghost" size="s" onClick={() => setDeleting(s.id)}>
                      {t('delete')}
                    </Button>
                  </>
                }
              />
              <div className="grid gap-3 px-4 py-3 text-body sm:grid-cols-2">
                <div>
                  <p className="text-fg">{describe(s)}</p>
                  <p className="text-small text-fg-secondary">
                    {t(`modes.${s.mode}`)} · {t(`deliveries.${s.delivery}`)}
                  </p>
                  <p className="mt-1 text-small text-fg-secondary">
                    {t('recipients')}: {s.recipients.join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-small font-semibold uppercase text-fg-tertiary">{t('history')}</p>
                  {s.deliveries.length === 0 ? (
                    <p className="text-small text-fg-tertiary">{t('noHistory')}</p>
                  ) : (
                    <Table>
                      <TBody>
                        {s.deliveries.map((d) => (
                          <TR key={d.id}>
                            <TD className="num">
                              {d.reportId ? (
                                <Link href={`/reports/${d.reportId}`} className="hover:text-brand">
                                  {d.period}
                                </Link>
                              ) : (
                                d.period
                              )}
                            </TD>
                            <TD>
                              <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>
                                {t(`status.${d.status}` as never)}
                              </Badge>
                              {d.reason ? (
                                <span className="ml-2 text-small text-fg-secondary">
                                  {t(`reasons.${d.reason}` as never)}
                                </span>
                              ) : null}
                            </TD>
                            <TD className="text-right">
                              {d.status === 'pending_approval' ? (
                                <Button
                                  kind="primary"
                                  size="s"
                                  disabled={pending}
                                  onClick={() =>
                                    run(
                                      () => api(`report-deliveries/${d.id}/approve`, { method: 'POST' }),
                                      t('approved'),
                                    )
                                  }
                                >
                                  {t('approve')}
                                </Button>
                              ) : null}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.id ? t('form.titleEdit') : t('form.titleNew')}
        description={t('form.periodNote')}
        closeLabel={tc('close')}
        footer={
          <Button kind="primary" size="m" disabled={pending || !form?.recipients.trim()} onClick={save}>
            {t('form.save')}
          </Button>
        }
      >
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('form.client')} htmlFor="sc-client" className="sm:col-span-2">
              <Select
                id="sc-client"
                value={form.clientId}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('form.cadence')} htmlFor="sc-cadence">
              <Select
                id="sc-cadence"
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value as 'weekly' | 'monthly' })}
              >
                <option value="weekly">{t('form.cadences.weekly')}</option>
                <option value="monthly">{t('form.cadences.monthly')}</option>
              </Select>
            </Field>
            {form.cadence === 'weekly' ? (
              <Field label={t('form.weekday')} htmlFor="sc-weekday">
                <Select
                  id="sc-weekday"
                  value={form.weekday}
                  onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {t(`weekdays.${d}` as never)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={t('form.monthDay')} htmlFor="sc-day">
                <Input
                  id="sc-day"
                  type="number"
                  min={1}
                  max={28}
                  value={form.monthDay}
                  onChange={(e) => setForm({ ...form, monthDay: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label={t('form.hour')} htmlFor="sc-hour">
              <Select
                id="sc-hour"
                value={form.sendHour}
                onChange={(e) => setForm({ ...form, sendHour: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('form.timezone')} htmlFor="sc-tz">
              <Select id="sc-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {COMMON_TIMEZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('form.mode')} htmlFor="sc-mode">
              <Select
                id="sc-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as 'auto' | 'approval' })}
              >
                <option value="auto">{t('modes.auto')}</option>
                <option value="approval">{t('modes.approval')}</option>
              </Select>
            </Field>
            <Field label={t('form.delivery')} htmlFor="sc-delivery">
              <Select
                id="sc-delivery"
                value={form.delivery}
                onChange={(e) => setForm({ ...form, delivery: e.target.value as 'link' | 'pdf' })}
              >
                <option value="link">{t('deliveries.link')}</option>
                <option value="pdf">{t('deliveries.pdf')}</option>
              </Select>
            </Field>
            <Field label={t('form.locale')} htmlFor="sc-locale">
              <Select
                id="sc-locale"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value as '' | 'vi' | 'en' })}
              >
                <option value="">{t('form.localeClient')}</option>
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t('form.recipients')} htmlFor="sc-recipients" className="sm:col-span-2">
              <Input
                id="sc-recipients"
                value={form.recipients}
                placeholder="khach@congty.vn, sep@congty.vn"
                onChange={(e) => setForm({ ...form, recipients: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('delete')}
        description={t('deleteConfirm')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setDeleting(null)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="danger"
              size="m"
              disabled={pending}
              onClick={() =>
                run(
                  () => api(`report-schedules/${deleting}`, { method: 'DELETE' }),
                  undefined,
                  () => setDeleting(null),
                )
              }
            >
              {t('delete')}
            </Button>
          </>
        }
      />
    </>
  );
}
