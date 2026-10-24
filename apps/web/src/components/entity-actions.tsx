'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Dialog, Field, Input, Skeleton } from '@adxlens/ui';
import { describeChange } from '@/lib/actions';
import { api, ApiError } from '@/lib/api-client';

export type ActionTarget = { adAccountId: string; metaId: string; name: string; dailyBudget?: string | null };
export type GridActionType = 'pause_ad' | 'resume_ad' | 'pause_adset' | 'resume_adset' | 'set_adset_budget';

type Preview = {
  target_name: string | null;
  currency: string;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  violations: { code: string; params?: Record<string, string | number> }[];
  undoable: boolean;
};

const body = (t: ActionTarget, type: GridActionType, budget?: string) => ({
  ad_account_id: t.adAccountId,
  action_type: type,
  target_meta_id: t.metaId,
  ...(type === 'set_adset_budget' ? { new_daily_budget: budget } : {}),
});

/**
 * G4: xem trước rồi duyệt hành động từ bảng chiến dịch (một hoặc nhiều đối tượng): trước → sau, vi phạm guardrails;
 * chỉ gửi đối tượng không vi phạm. Mỗi hành động qua Execution Gateway (thực hiện + xác minh, xem ở Nhật ký).
 */
export function ActionDialog({
  open,
  onOpenChange,
  targets,
  type,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targets: ActionTarget[];
  type: GridActionType;
  onDone?: () => void;
}) {
  const t = useTranslations('gridActions');
  const ta = useTranslations('actionLog');
  const tap = useTranslations('approve');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [budget, setBudget] = useState(targets[0]?.dailyBudget ? String(Number(targets[0].dailyBudget)) : '');
  const [previews, setPreviews] = useState<Record<string, Preview | { error: string }> | null>(null);
  const [pending, start] = useTransition();
  // Lỗi khi gửi (quyền ghi, kill switch, quyền duyệt…) theo từng đối tượng — giữ hộp thoại mở để thấy lý do.
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Set<string>>(new Set());
  const key = (x: ActionTarget) => `${x.adAccountId}:${x.metaId}`;
  const isBudget = type === 'set_adset_budget';

  const load = () => {
    setPreviews(null);
    setFailures({});
    setSent(new Set());
    Promise.all(
      targets.map((x) =>
        api<Preview>('actions/preview', { method: 'POST', body: body(x, type, budget) })
          .then((p) => [key(x), p] as const)
          .catch((e: unknown) => [key(x), { error: e instanceof ApiError ? e.message : tc('errorGeneric') }] as const),
      ),
    ).then((rows) => setPreviews(Object.fromEntries(rows)));
  };
  useEffect(() => {
    if (open && !isBudget) load();
    if (open && isBudget) setPreviews(null);
  }, [open, type]);

  const ready = previews
    ? targets.filter((x) => {
        const p = previews[key(x)];
        return p && !('error' in p) && p.violations.length === 0 && !failures[key(x)] && !sent.has(key(x));
      })
    : [];

  const submit = () =>
    start(async () => {
      try {
        const r = await api<{ requested: number; items: { key: string; ok: boolean; message?: string }[] }>(
          'actions/bulk',
          { method: 'POST', body: { items: ready.map((x) => body(x, type, budget)) } },
        );
        const failed = r.items.filter((i) => !i.ok);
        if (failed.length) {
          setFailures(Object.fromEntries(failed.map((i) => [i.key, i.message ?? tc('errorGeneric')])));
          setSent(new Set(r.items.filter((i) => i.ok).map((i) => i.key)));
          toast.error(
            r.requested
              ? t('partial', { ok: r.requested, failed: failed.length })
              : t('failed', { count: failed.length }),
          );
          if (r.requested) router.refresh();
          return;
        }
        toast.success(t('queued', { count: r.requested }));
        onOpenChange(false);
        onDone?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`title.${type}`, { count: targets.length })}
      closeLabel={tc('close')}
      footer={
        <>
          <Button kind="secondary" size="m" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            kind="primary"
            size="m"
            disabled={pending || !ready.length}
            onClick={submit}
            data-testid="grid-action-confirm"
          >
            {t('confirm', { count: ready.length })}
          </Button>
        </>
      }
    >
      <Banner tone="info" className="mb-3">
        {t('note')}{' '}
        <Link href="/action-log" className="text-link underline">
          {t('log')}
        </Link>
      </Banner>
      {isBudget ? (
        <div className="mb-3 flex items-end gap-2">
          <Field label={t('newBudget')} htmlFor="grid-budget" className="flex-1">
            <Input
              id="grid-budget"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value.trim())}
            />
          </Field>
          <Button kind="secondary" size="m" disabled={!/^\d+(\.\d{1,2})?$/.test(budget)} onClick={load}>
            {t('preview')}
          </Button>
        </div>
      ) : null}
      {isBudget && previews === null ? null : previews === null ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {targets.map((x) => {
            const p = previews[key(x)]!;
            return (
              <li key={key(x)} className="rounded-md border border-line px-3 py-2 text-body">
                <p className="font-medium">{x.name}</p>
                {'error' in p ? (
                  <p className="text-small text-danger">{p.error}</p>
                ) : (
                  <>
                    <p className="num text-small">
                      {ta(`types.${type}` as never)} ·{' '}
                      {describeChange({ beforeState: p.before, afterExpected: p.after, currency: p.currency }, format, {
                        t: (k) => ta(k as never),
                      })}
                    </p>
                    {sent.has(key(x)) ? (
                      <Badge tone="success">{t('sent')}</Badge>
                    ) : failures[key(x)] ? (
                      <p className="text-small text-danger" data-testid="grid-action-failure">
                        {failures[key(x)]}
                      </p>
                    ) : p.violations.length ? (
                      <p className="text-small text-danger">
                        {p.violations.map((v) => tap(`violations.${v.code}` as never, v.params as never)).join(' · ')}
                      </p>
                    ) : (
                      <Badge tone="success">{t('ok')}</Badge>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
