'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, Field, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { FLAG_LABEL } from '@/lib/admin';

export type Proposal = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  flag: string;
  reason: string;
  proposerEmail: string | null;
  mine: boolean;
  createdAt: string;
};
type Check = { id: string; label: string; passed: boolean; detail?: string };
type Decision = 'approve' | 'reject' | 'cancel';

/** Đề xuất bật cờ đang chờ (ADR-0013): superadmin duyệt / từ chối, người đề xuất tự hủy. */
export function ProposalsPanel({ items, canDecide }: { items: Proposal[]; canDecide: boolean }) {
  const t = useTranslations('admin.flags');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [target, setTarget] = useState<{ p: Proposal; decision: Decision } | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [pending, start] = useTransition();
  const flagName = (k: string) => (FLAG_LABEL[k] ? t(`names.${FLAG_LABEL[k]}`) : k);

  useEffect(() => {
    setChecks(null);
    setNote('');
    setOverride(false);
    if (target?.decision !== 'approve') return;
    api<{ items: Check[] }>(`admin/workspaces/${target.p.workspaceId}/flags/${target.p.flag}/checklist`)
      .then((r) => setChecks(r.items))
      .catch(() => setChecks([]));
  }, [target]);

  if (!items.length) return null;
  const allPassed = checks?.every((c) => c.passed) ?? false;
  const parentFailed = checks?.some((c) => c.id === 'parent_enabled' && !c.passed) ?? false;
  const canSubmit =
    target?.decision === 'approve'
      ? checks !== null && !parentFailed && (allPassed || override)
      : note.trim().length >= 5;

  const submit = () =>
    start(async () => {
      if (!target) return;
      try {
        await api(`admin/flag-proposals/${target.p.id}`, {
          method: 'POST',
          body:
            target.decision === 'approve'
              ? { decision: 'approve', note: note || undefined, override: allPassed ? undefined : true }
              : { decision: target.decision, note },
        });
        toast.success(t(`proposals.done.${target.decision}`));
        setTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  return (
    <Card className="mb-4" data-testid="flag-proposals">
      <CardHeader title={t('proposals.title', { count: items.length })} />
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-body">
            <Badge tone="warning">{flagName(p.flag)}</Badge>
            <span className="font-medium">{p.workspaceName}</span>
            <span className="flex-1 text-fg-secondary">
              {p.reason}
              <span className="block text-small text-fg-tertiary">
                {t('proposals.by', {
                  email: p.proposerEmail ?? '—',
                  at: format.dateTime(new Date(p.createdAt), { dateStyle: 'short', timeStyle: 'short' }),
                })}
              </span>
            </span>
            {canDecide ? (
              <>
                <Button kind="primary" size="s" onClick={() => setTarget({ p, decision: 'approve' })}>
                  {t('proposals.approve')}
                </Button>
                <Button kind="secondary" size="s" onClick={() => setTarget({ p, decision: 'reject' })}>
                  {t('proposals.reject')}
                </Button>
              </>
            ) : null}
            {p.mine ? (
              <Button kind="ghost" size="s" onClick={() => setTarget({ p, decision: 'cancel' })}>
                {t('proposals.cancel')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={
          target
            ? t(`proposals.dialog.${target.decision}`, {
                flag: flagName(target.p.flag),
                workspace: target.p.workspaceName,
              })
            : ''
        }
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setTarget(null)}>
              {tc('cancel')}
            </Button>
            <Button
              kind={target?.decision === 'approve' ? 'primary' : 'danger'}
              size="m"
              disabled={!canSubmit || pending}
              onClick={submit}
            >
              {target ? t(`proposals.${target.decision}`) : ''}
            </Button>
          </>
        }
      >
        {target?.decision === 'approve' ? (
          <>
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('dialog.checklist')}</h3>
            {checks === null ? (
              <p className="mt-1 text-body text-fg-secondary">{t('dialog.checking')}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 text-body">
                    <span>
                      {c.label}
                      {c.detail ? <span className="block text-small text-fg-tertiary">{c.detail}</span> : null}
                    </span>
                    <Badge tone={c.passed ? 'success' : 'danger'}>
                      {c.passed ? t('dialog.passed') : t('dialog.failed')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {checks && !allPassed && !parentFailed ? (
              <label className="mt-3 flex items-center gap-2 text-body">
                <Checkbox checked={override} onChange={(e) => setOverride(e.target.checked)} />
                {t('dialog.override')}
              </label>
            ) : null}
          </>
        ) : null}
        <Field
          label={target?.decision === 'approve' ? t('proposals.noteOptional') : t('dialog.reason')}
          htmlFor="proposal-note"
          className="mt-3"
        >
          <Textarea
            id="proposal-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </Dialog>
    </Card>
  );
}
