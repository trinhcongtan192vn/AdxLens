'use client';

import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  Dialog,
  Drawer,
  Field,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { ApproveAction } from './approve-dialog';

export type ActionView = {
  id: string;
  sourceKey: string;
  accountName: string;
  clientName: string | null;
  entityName: string;
  action: string;
  why: string;
  evidence: Record<string, unknown>;
  impact: string | null;
  confidence: number;
  effortMinutes: number;
  status: 'proposed' | 'in_progress' | 'done' | 'skipped';
  skipReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  deepLink: string | null;
};

const STATUS_TONE = { proposed: 'info', in_progress: 'warning', done: 'success', skipped: 'neutral' } as const;
const SKIP_REASONS = ['not_relevant', 'wrong', 'later', 'other'] as const;

/** P101 bảng việc + P102 drawer chi tiết (bằng chứng, tác động, độ tin cậy, công sức, trạng thái, người làm). */
export function WeeklyActionsList({
  items,
  canUpdate,
  canExecute = false,
}: {
  items: ActionView[];
  canUpdate: boolean;
  /** Cờ duyệt hành động bật: hiện nút duyệt thực hiện trên Meta (P202). */
  canExecute?: boolean;
}) {
  const t = useTranslations('weekly');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<ActionView | null>(null);
  const [skipFor, setSkipFor] = useState<ActionView | null>(null);
  const [skipReason, setSkipReason] = useState<(typeof SKIP_REASONS)[number]>('not_relevant');
  const [assignees, setAssignees] = useState<{ user_id: string; name: string }[] | null>(null);

  const patch = (id: string, body: Record<string, unknown>, done?: () => void) =>
    start(async () => {
      try {
        await api(`recommendations/${id}`, { method: 'PATCH', body });
        toast.success(tc('saved'));
        done?.();
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  const setStatus = (a: ActionView, status: ActionView['status']) => {
    if (status === 'skipped') {
      setSkipFor(a);
      return;
    }
    patch(a.id, { status });
  };

  const openDrawer = (a: ActionView) => {
    setOpen(a);
    setAssignees(null);
    if (canUpdate) {
      api<{ items: { user_id: string; name: string }[] }>(`recommendations/${a.id}/assignees`)
        .then((r) => setAssignees(r.items))
        .catch(() => setAssignees([]));
    }
  };

  const effort = (m: number) => (m >= 60 ? t('hours', { n: Math.round(m / 6) / 10 }) : t('minutes', { n: m }));

  return (
    <>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>{t('cols.action')}</TH>
              <TH>{t('cols.account')}</TH>
              <TH numeric>{t('cols.impact')}</TH>
              <TH numeric>{t('cols.confidence')}</TH>
              <TH numeric>{t('cols.effort')}</TH>
              <TH>{t('cols.status')}</TH>
              <TH>{t('cols.assignee')}</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((a, i) => (
              <TR key={a.id} data-testid="weekly-row" data-source={a.sourceKey}>
                <TD muted>{i + 1}</TD>
                <TD>
                  <button type="button" className="text-left hover:underline" onClick={() => openDrawer(a)}>
                    <span className="font-medium text-fg">{a.action}</span>
                    <span className="block text-small text-fg-secondary">{a.entityName}</span>
                  </button>
                </TD>
                <TD muted>
                  {a.accountName}
                  {a.clientName ? <span className="block text-small">{a.clientName}</span> : null}
                </TD>
                <TD numeric>{a.impact ?? '—'}</TD>
                <TD numeric>{format.number(a.confidence, { style: 'percent' })}</TD>
                <TD numeric>{effort(a.effortMinutes)}</TD>
                <TD>
                  {canUpdate ? (
                    <Select
                      aria-label={t('cols.status')}
                      value={a.status}
                      disabled={pending}
                      onChange={(e) => setStatus(a, e.target.value as ActionView['status'])}
                      className="w-auto"
                    >
                      {(['proposed', 'in_progress', 'done', 'skipped'] as const).map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={STATUS_TONE[a.status]}>{t(`status.${a.status}`)}</Badge>
                  )}
                </TD>
                <TD muted>{a.assigneeName ?? '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Drawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t('detail')}
        closeLabel={tc('close')}
      >
        {open ? (
          <div className="flex flex-col gap-4 text-body">
            <div>
              <h3 className="text-h3 font-semibold text-fg">{open.action}</h3>
              <p className="text-small text-fg-secondary">
                {open.entityName} · {open.accountName}
              </p>
            </div>
            <section>
              <h4 className="mb-1 text-small font-semibold uppercase text-fg-secondary">{t('why')}</h4>
              <p className="text-fg">{open.why}</p>
            </section>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-fg-secondary">{t('cols.impact')}</dt>
              <dd className="num text-fg">{open.impact ?? t('noImpact')}</dd>
              <dt className="text-fg-secondary">{t('cols.confidence')}</dt>
              <dd className="num text-fg">{format.number(open.confidence, { style: 'percent' })}</dd>
              <dt className="text-fg-secondary">{t('cols.effort')}</dt>
              <dd className="text-fg">{effort(open.effortMinutes)}</dd>
            </dl>
            <p className="text-small text-fg-secondary">{t('scoreNote')}</p>
            {canUpdate ? (
              <Field label={t('cols.assignee')} htmlFor="assignee">
                <Select
                  id="assignee"
                  value={open.assigneeId ?? ''}
                  disabled={pending || assignees === null}
                  onChange={(e) =>
                    patch(open.id, { assignee_id: e.target.value || null }, () =>
                      setOpen({
                        ...open,
                        assigneeId: e.target.value || null,
                        assigneeName: assignees?.find((m) => m.user_id === e.target.value)?.name ?? null,
                      }),
                    )
                  }
                >
                  <option value="">{t('unassigned')}</option>
                  {(assignees ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {open.status === 'skipped' && open.skipReason ? (
              <p className="text-small text-fg-secondary">
                {t('skippedBecause', { reason: t(`skip.${open.skipReason}` as never) })}
              </p>
            ) : null}
            {canExecute && canUpdate && open.status !== 'done' && open.status !== 'skipped' ? (
              <section className="border-t border-line pt-3">
                <ApproveAction recommendationId={open.id} />
              </section>
            ) : null}
            {open.deepLink ? (
              <a
                href={open.deepLink}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ kind: 'secondary', size: 'm' })}
              >
                {t('openAdsManager')} <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={skipFor !== null}
        onOpenChange={(o) => !o && setSkipFor(null)}
        title={t('skipTitle')}
        description={t('skipBody')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setSkipFor(null)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="primary"
              size="m"
              disabled={pending}
              onClick={() =>
                skipFor && patch(skipFor.id, { status: 'skipped', skip_reason: skipReason }, () => setSkipFor(null))
              }
            >
              {t('skipConfirm')}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('skipTitle')}</legend>
          {SKIP_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-body">
              <input
                type="radio"
                name="skip-reason"
                value={r}
                checked={skipReason === r}
                onChange={() => setSkipReason(r)}
              />
              {t(`skip.${r}`)}
            </label>
          ))}
        </fieldset>
      </Dialog>
    </>
  );
}
