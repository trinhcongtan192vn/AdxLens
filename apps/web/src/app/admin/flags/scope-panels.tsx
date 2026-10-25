'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Dialog, Field, Table, TBody, TD, TH, THead, Textarea, TR } from '@adxlens/ui';
import { FLAG_LABEL } from '@/lib/admin';
import { api, ApiError } from '@/lib/api-client';

type History = {
  scope: 'global' | 'plan';
  plan: string | null;
  flag: string;
  old_value: boolean;
  new_value: boolean;
  reason: string;
  at: string;
};
type Target =
  { kind: 'global'; key: string; enable: boolean } | { kind: 'plan'; plan: string; key: string; enable: boolean };

/**
 * ADR-0024: cờ TOÀN APP và ma trận GÓI × tính năng. Chỉ superadmin đổi (server kiểm lại trong core/flags); mỗi thay đổi
 * bắt buộc lý do và ghi nhật ký. Tính năng chạy cho workspace = toàn app bật VÀ gói có, trừ ngoại lệ bên dưới.
 */
export function ScopePanels({
  flagKeys,
  planKeys,
  global,
  plans,
  canEdit,
  history,
}: {
  flagKeys: string[];
  planKeys: string[];
  global: Record<string, boolean>;
  plans: Record<string, Record<string, boolean>>;
  canEdit: boolean;
  history: History[];
}) {
  const t = useTranslations('admin.flags');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const flagName = (k: string) => (FLAG_LABEL[k] ? t(`names.${FLAG_LABEL[k]}`) : k);
  const open = (x: Target) => {
    setReason('');
    setTarget(x);
  };
  const submit = () =>
    start(async () => {
      if (!target) return;
      try {
        await api(
          target.kind === 'global'
            ? `admin/flags/global/${target.key}`
            : `admin/flags/plans/${target.plan}/${target.key}`,
          { method: 'POST', body: { enabled: target.enable, reason } },
        );
        toast.success(t('dialog.done'));
        setTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  return (
    <>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card data-testid="flags-global">
          <h2 className="text-h4 font-semibold text-fg">{t('global.title')}</h2>
          <p className="mt-1 text-small text-fg-secondary">{t('global.intro')}</p>
          <ul className="mt-3 space-y-2">
            {flagKeys.map((k) => (
              <li key={k} className="flex items-center justify-between gap-2">
                <span className="text-body text-fg">
                  {flagName(k)} <span className="font-mono text-caption text-fg-tertiary">{k}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={global[k] ? 'success' : 'neutral'}>{global[k] ? t('on') : t('off')}</Badge>
                  {canEdit ? (
                    <Button
                      kind={global[k] ? 'secondary' : 'primary'}
                      size="s"
                      onClick={() => open({ kind: 'global', key: k, enable: !global[k] })}
                      aria-label={`${global[k] ? t('global.turnOff') : t('global.turnOn')} ${flagName(k)}`}
                      data-testid={`global-${k}`}
                    >
                      {global[k] ? t('global.turnOff') : t('global.turnOn')}
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="overflow-x-auto" data-testid="flags-plans">
          <h2 className="text-h4 font-semibold text-fg">{t('plans.title')}</h2>
          <p className="mt-1 text-small text-fg-secondary">{t('plans.intro')}</p>
          <Table className="mt-2">
            <THead>
              <tr>
                <TH>{t('plans.plan')}</TH>
                {flagKeys.map((k) => (
                  <TH key={k}>{flagName(k)}</TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {planKeys.map((p) => (
                <TR key={p}>
                  <TD className="font-medium capitalize">{p}</TD>
                  {flagKeys.map((k) => {
                    const on = plans[p]?.[k] ?? false;
                    return (
                      <TD key={k}>
                        <button
                          type="button"
                          disabled={!canEdit}
                          aria-label={`${p} · ${flagName(k)}`}
                          data-testid={`plan-${p}-${k}`}
                          onClick={() => open({ kind: 'plan', plan: p, key: k, enable: !on })}
                        >
                          <Badge tone={on ? 'success' : 'neutral'}>
                            {on ? t('plans.included') : t('plans.excluded')}
                          </Badge>
                        </button>
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
      {history.length ? (
        <details className="mb-4 text-small text-fg-secondary">
          <summary className="cursor-pointer text-fg">{t('scopeHistory')}</summary>
          <ul className="mt-1 space-y-0.5">
            {history.map((h, i) => (
              <li key={i}>
                {format.dateTime(new Date(h.at), { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                {h.scope === 'global' ? t('global.title') : `${t('plans.plan')} ${h.plan}`} · {flagName(h.flag)} →{' '}
                {h.new_value ? t('on') : t('off')} · {h.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={
          target
            ? target.kind === 'global'
              ? t(target.enable ? 'global.enableTitle' : 'global.disableTitle', { flag: flagName(target.key) })
              : t(target.enable ? 'plans.addTitle' : 'plans.removeTitle', {
                  flag: flagName(target.key),
                  plan: target.plan,
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
              disabled={reason.trim().length < 5 || pending}
              onClick={submit}
            >
              {tc('confirm')}
            </Button>
          </>
        }
      >
        <p className="text-body text-fg-secondary">
          {target?.kind === 'global' ? t(target.enable ? 'global.enableHint' : 'global.disableHint') : t('plans.hint')}
        </p>
        <Field label={t('dialog.reason')} htmlFor="scope-reason" className="mt-3">
          <Textarea
            id="scope-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </Dialog>
    </>
  );
}
