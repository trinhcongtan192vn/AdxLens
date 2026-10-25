'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
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
import { FLAG_LABEL } from '@/lib/admin';
import { api, ApiError } from '@/lib/api-client';

type Row = {
  id: string;
  name: string;
  ownerEmail: string | null;
  accounts: number;
  createdAt: string;
  plan: string;
  /** Giá trị hiệu lực (toàn app × gói, hoặc ngoại lệ). */
  flags: Record<string, boolean>;
  /** Ngoại lệ: true = bật thêm, false = tắt riêng; không có = theo toàn app × gói. */
  overrides: Record<string, boolean | undefined>;
};
type History = { flag: string; old_value: boolean; new_value: boolean; reason: string; override: boolean; at: string };
type Choice = 'on' | 'off' | 'clear';

/**
 * AD01 + AD02 (ADR-0024): ngoại lệ theo workspace. Mỗi ô: giá trị hiệu lực + nhãn ngoại lệ. Bấm để chọn Bật thêm
 * (superadmin; operator gửi đề xuất), Tắt riêng (mọi staff, tắt luôn cờ con) hoặc Theo gói (bỏ ngoại lệ).
 */
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
  const [target, setTarget] = useState<{ row: Row; key: string } | null>(null);
  const [choice, setChoice] = useState<Choice>('on');
  const [history, setHistory] = useState<History[]>([]);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState(q);
  const [pending, start] = useTransition();

  useEffect(() => {
    setReason('');
    if (!target) return;
    const ov = target.row.overrides[target.key];
    setChoice(ov === undefined ? (target.row.flags[target.key] ? 'off' : 'on') : 'clear');
    api<{ items: History[] }>(`admin/workspaces/${target.row.id}/flag-history`)
      .then((r) => setHistory(r.items.filter((h) => h.flag === target.key).slice(0, 5)))
      .catch(() => setHistory([]));
  }, [target]);

  const proposing = choice === 'on' && !canEnable;
  const submit = () =>
    start(async () => {
      if (!target) return;
      try {
        if (proposing) {
          await api('admin/flag-proposals', {
            method: 'POST',
            body: { workspace_id: target.row.id, flag: target.key, reason },
          });
          toast.success(t('dialog.proposed'));
        } else if (choice === 'clear') {
          await api(`admin/workspaces/${target.row.id}/flags/${target.key}`, { method: 'DELETE', body: { reason } });
          toast.success(t('dialog.done'));
        } else {
          await api(`admin/workspaces/${target.row.id}/flags/${target.key}`, {
            method: 'POST',
            body: { enabled: choice === 'on', reason },
          });
          toast.success(t('dialog.done'));
        }
        setTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  const flagName = (k: string) => (FLAG_LABEL[k] ? t(`names.${FLAG_LABEL[k]}`) : k);

  return (
    <>
      <h2 className="mb-1 text-h4 font-semibold text-fg">{t('overrides.title')}</h2>
      <p className="mb-2 text-small text-fg-secondary">{t('overrides.intro')}</p>
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
                <TH>{t('plans.plan')}</TH>
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
                  <TD className="font-medium">
                    {r.name}
                    <span className="block text-caption font-normal text-fg-tertiary">{r.ownerEmail ?? '—'}</span>
                  </TD>
                  <TD className="capitalize">{r.plan}</TD>
                  <TD numeric>{r.accounts}</TD>
                  {flagKeys.map((k) => {
                    const ov = r.overrides[k];
                    return (
                      <TD key={k}>
                        <button
                          type="button"
                          data-testid={`flag-${r.id}-${k}`}
                          aria-label={`${flagName(k)} · ${r.name}`}
                          onClick={() => setTarget({ row: r, key: k })}
                          className="flex flex-col items-start gap-0.5"
                        >
                          <Badge tone={r.flags[k] ? 'success' : 'neutral'}>{r.flags[k] ? t('on') : t('off')}</Badge>
                          {ov !== undefined ? (
                            <span className="text-caption text-warning">
                              {ov ? t('overrides.forcedOn') : t('overrides.forcedOff')}
                            </span>
                          ) : null}
                        </button>
                      </TD>
                    );
                  })}
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
        title={target ? t('overrides.dialogTitle', { flag: flagName(target.key), workspace: target.row.name }) : ''}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setTarget(null)}>
              {tc('cancel')}
            </Button>
            <Button
              kind={choice === 'off' ? 'danger' : 'primary'}
              size="m"
              disabled={reason.trim().length < 5 || pending}
              onClick={submit}
            >
              {proposing ? t('dialog.propose') : tc('confirm')}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-1" data-testid="override-choice">
          {(['on', 'off', 'clear'] as const).map((c) => (
            <label key={c} className="flex items-start gap-2 text-body">
              <input
                type="radio"
                name="override"
                checked={choice === c}
                onChange={() => setChoice(c)}
                className="mt-1"
              />
              <span>
                {t(`overrides.choice.${c}`)}
                <span className="block text-small text-fg-tertiary">{t(`overrides.choiceHint.${c}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {proposing ? <p className="mt-2 text-small text-fg-secondary">{t('dialog.proposeHint')}</p> : null}
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
