'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Row = {
  id: string;
  name: string;
  ownerEmail: string | null;
  accounts: number;
  createdAt: string;
  flags: Record<string, boolean>;
};
type Check = { id: string; label: string; passed: boolean; detail?: string };
type History = { flag: string; old_value: boolean; new_value: boolean; reason: string; override: boolean; at: string };

/** AD01 + AD02: bảng workspace × cờ; bấm ô để bật/tắt có checklist, lý do, vượt checklist ghi log. */
export function FlagMatrix({
  rows,
  flagKeys,
  canEnable,
  q,
}: {
  rows: Row[];
  flagKeys: string[];
  canEnable: boolean;
  q: string;
}) {
  const t = useTranslations('admin.flags');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [target, setTarget] = useState<{ row: Row; key: string; enable: boolean } | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [search, setSearch] = useState(q);
  const [pending, start] = useTransition();

  useEffect(() => {
    setChecks(null);
    setReason('');
    setOverride(false);
    if (!target) return;
    if (target.enable) {
      api<{ items: Check[] }>(`admin/workspaces/${target.row.id}/flags/${target.key}/checklist`)
        .then((r) => setChecks(r.items))
        .catch(() => setChecks([]));
    }
    api<{ items: History[] }>(`admin/workspaces/${target.row.id}/flag-history`)
      .then((r) => setHistory(r.items.filter((h) => h.flag === target.key).slice(0, 5)))
      .catch(() => setHistory([]));
  }, [target]);

  const allPassed = checks?.every((c) => c.passed) ?? false;
  const parentFailed = checks?.some((c) => c.id === 'parent_enabled' && !c.passed) ?? false;
  const canSubmit =
    reason.trim().length >= 5 &&
    (!target?.enable || (canEnable && checks !== null && !parentFailed && (allPassed || override)));

  const submit = () =>
    start(async () => {
      if (!target) return;
      try {
        await api(`admin/workspaces/${target.row.id}/flags/${target.key}`, {
          method: 'POST',
          body: { enabled: target.enable, reason, override: target.enable && !allPassed ? true : undefined },
        });
        toast.success(t('dialog.done'));
        setTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  // Khóa i18n trung tính (chuỗi giao diện không chứa tên cờ — CLAUDE.md quy tắc 7).
  const LABEL: Record<string, string> = {
    p0_reports: 'reports',
    p1_recommendations: 'recommendations',
    p2a_approve: 'approve',
    p2b_auto: 'auto',
  };
  const flagName = (k: string) => (LABEL[k] ? t(`names.${LABEL[k]}`) : k);

  return (
    <>
      <form
        className="mb-3 w-80"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/admin/flags${search ? `?q=${encodeURIComponent(search)}` : ''}`);
        }}
      >
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.owner')}</TH>
                <TH numeric>{t('cols.accounts')}</TH>
                {flagKeys.map((k) => (
                  <TH key={k}>
                    {flagName(k)}
                    {/* Trang nội bộ: hiện khóa cờ từ code (không nằm trong chuỗi giao diện khách). */}
                    <span className="block font-mono text-caption font-normal normal-case text-fg-tertiary">{k}</span>
                  </TH>
                ))}
                <TH>{t('cols.created')}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD muted>{r.ownerEmail ?? '—'}</TD>
                  <TD numeric>{r.accounts}</TD>
                  {flagKeys.map((k) => (
                    <TD key={k}>
                      <button
                        type="button"
                        data-testid={`flag-${r.id}-${k}`}
                        aria-label={`${flagName(k)} · ${r.name}`}
                        onClick={() => setTarget({ row: r, key: k, enable: !r.flags[k] })}
                      >
                        <Badge tone={r.flags[k] ? 'success' : 'neutral'}>{r.flags[k] ? t('on') : t('off')}</Badge>
                      </button>
                    </TD>
                  ))}
                  <TD muted>{format.dateTime(new Date(r.createdAt), { dateStyle: 'short' })}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={
          target
            ? t(target.enable ? 'dialog.enableTitle' : 'dialog.disableTitle', {
                flag: flagName(target.key),
                workspace: target.row.name,
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
              kind={target?.enable ? 'primary' : 'danger'}
              size="m"
              disabled={!canSubmit || pending}
              onClick={submit}
            >
              {target?.enable ? t('dialog.enable') : t('dialog.disable')}
            </Button>
          </>
        }
      >
        {target?.enable ? (
          <>
            {!canEnable ? <p className="mb-2 text-body text-danger">{t('dialog.onlyPm')}</p> : null}
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('dialog.checklist')}</h3>
            {checks === null ? (
              <p className="mt-1 text-body text-fg-secondary">{t('dialog.checking')}</p>
            ) : (
              <ul className="mt-1 space-y-1" data-testid="flag-checklist">
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
            {checks && !allPassed && !parentFailed && canEnable ? (
              <label className="mt-3 flex items-center gap-2 text-body">
                <Checkbox checked={override} onChange={(e) => setOverride(e.target.checked)} />
                {t('dialog.override')}
              </label>
            ) : null}
          </>
        ) : (
          <p className="text-body text-fg-secondary">{t('dialog.dependents')}</p>
        )}
        <Field label={t('dialog.reason')} htmlFor="flag-reason" className="mt-3">
          <Textarea
            id="flag-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <h3 className="mt-3 text-small font-semibold uppercase text-fg-tertiary">{t('dialog.history')}</h3>
        {history.length ? (
          <ul className="mt-1 space-y-1 text-small text-fg-secondary">
            {history.map((h, i) => (
              <li key={i}>
                {format.dateTime(new Date(h.at), { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                {h.new_value ? t('on') : t('off')} · {h.reason}
                {h.override ? ` · ${t('dialog.overrideTag')}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-fg-tertiary">{t('dialog.noHistory')}</p>
        )}
      </Dialog>
    </>
  );
}
