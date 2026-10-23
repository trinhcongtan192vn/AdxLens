'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Field, Select, Table, TBody, TD, TH, THead, TR, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

function useAction() {
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, done: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(done);
        after?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  return { pending, run };
}

/** Chạy lại đồng bộ một tài khoản QC (1–90 ngày), có lý do; ghi nhật ký admin. */
export function ResyncButton({ adAccountId, label }: { adAccountId: string; label: string }) {
  const t = useTranslations('admin.operations');
  const tc = useTranslations('common');
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  return (
    <>
      <Button kind="secondary" size="s" onClick={() => setOpen(true)} data-testid={`resync-${adAccountId}`}>
        {t('resync')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('resyncTitle', { account: label })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="primary"
              size="m"
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                run(
                  () =>
                    api(`admin/ad-accounts/${adAccountId}/resync`, {
                      method: 'POST',
                      body: { days: Number(days), reason },
                    }),
                  t('resyncQueued'),
                  () => {
                    setOpen(false);
                    setReason('');
                  },
                )
              }
            >
              {t('resync')}
            </Button>
          </>
        }
      >
        <Field label={t('days')} htmlFor={`days-${adAccountId}`}>
          <Select id={`days-${adAccountId}`} value={days} onChange={(e) => setDays(e.target.value)}>
            {['3', '7', '30', '90'].map((d) => (
              <option key={d} value={d}>
                {t('daysOption', { days: d })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('reason')} htmlFor={`reason-${adAccountId}`} className="mt-3">
          <Textarea id={`reason-${adAccountId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

type Failed = { id: string; name: string; reason: string | null; attempts: number; failed_at: string | null };

/** Xem job lỗi của một queue; chạy lại (trừ queue ghi Meta) hoặc bỏ, có lý do. */
export function FailedJobsButton({ queue, count }: { queue: string; count: number }) {
  const t = useTranslations('admin.operations');
  const tc = useTranslations('common');
  const format = useFormatter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Failed[] | null>(null);
  const [retryable, setRetryable] = useState(true);
  const [reason, setReason] = useState('');
  const load = () =>
    api<{ items: Failed[]; retryable: boolean }>(`admin/queues/${queue}/failed`)
      .then((r) => {
        setItems(r.items);
        setRetryable(r.retryable);
      })
      .catch(() => setItems([]));
  const act = (id: string, action: 'retry' | 'discard') =>
    run(
      () => api(`admin/queues/${queue}/jobs/${encodeURIComponent(id)}`, { method: 'POST', body: { action, reason } }),
      t(action === 'retry' ? 'retried' : 'discarded'),
      () => void load(),
    );
  if (count === 0) return <span className="text-fg-tertiary">0</span>;
  return (
    <>
      <Button
        kind="ghost"
        size="s"
        className="text-danger"
        onClick={() => {
          setOpen(true);
          setItems(null);
          void load();
        }}
      >
        {count}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('failedTitle', { queue })}
        closeLabel={tc('close')}
        footer={
          <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
            {tc('close')}
          </Button>
        }
      >
        {!retryable ? <p className="mb-2 text-body text-warning">{t('noRetry')}</p> : null}
        <Field label={t('reason')} htmlFor={`job-reason-${queue}`}>
          <Textarea id={`job-reason-${queue}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {items === null ? (
          <p className="mt-3 text-body text-fg-secondary">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-body text-fg-tertiary">{t('noFailed')}</p>
        ) : (
          <Table className="mt-3">
            <THead>
              <tr>
                <TH>{t('cols.job')}</TH>
                <TH>{t('cols.error')}</TH>
                <TH>{t('cols.actions')}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((j) => (
                <TR key={j.id}>
                  <TD>
                    <span className="font-mono text-small">{j.name}</span>
                    <span className="block text-small text-fg-tertiary">
                      {j.failed_at
                        ? format.dateTime(new Date(j.failed_at), { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}{' '}
                      · {t('attempts', { n: j.attempts })}
                    </span>
                  </TD>
                  <TD muted className="max-w-[280px] break-words font-mono text-small">
                    {j.reason ?? '—'}
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      {retryable ? (
                        <Button
                          size="s"
                          disabled={pending || reason.trim().length < 5}
                          onClick={() => act(j.id, 'retry')}
                        >
                          {t('retry')}
                        </Button>
                      ) : null}
                      <Button
                        kind="ghost"
                        size="s"
                        disabled={pending || reason.trim().length < 5}
                        onClick={() => act(j.id, 'discard')}
                      >
                        {t('discard')}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Dialog>
    </>
  );
}
