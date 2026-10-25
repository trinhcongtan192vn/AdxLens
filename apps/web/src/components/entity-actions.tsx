'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Dialog, Field, Input, Skeleton } from '@adxlens/ui';
import { describeChange } from '@/lib/actions';
import { api, ApiError } from '@/lib/api-client';

export type ActionTarget = {
  adAccountId: string;
  metaId: string;
  name: string;
  dailyBudget?: string | null;
  /** ADR-0025: giá thầu hiện tại (nhóm QC Bid cap / Cost cap), giới hạn chi hiện tại (chiến dịch). */
  bidAmount?: string | null;
  spendCap?: string | null;
};
export type GridActionType =
  | 'pause_ad'
  | 'resume_ad'
  | 'pause_adset'
  | 'resume_adset'
  | 'set_adset_budget'
  | 'pause_campaign'
  | 'resume_campaign'
  | 'rename_ad'
  | 'rename_adset'
  | 'rename_campaign'
  | 'set_adset_bid'
  | 'set_campaign_spend_cap';

/** ADR-0025: loại đổi tên theo cấp. */
export const renameType = (level: 'ad' | 'adset' | 'campaign'): GridActionType => `rename_${level}`;

type Preview = {
  target_name: string | null;
  currency: string;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  violations: { code: string; params?: Record<string, string | number> }[];
  undoable: boolean;
};

const body = (t: ActionTarget, type: GridActionType, value?: string) => ({
  ad_account_id: t.adAccountId,
  action_type: type,
  target_meta_id: t.metaId,
  ...(type === 'set_adset_budget' ? { new_daily_budget: value } : {}),
  ...(type.startsWith('rename_') ? { new_name: value } : {}),
  ...(type === 'set_adset_bid' || type === 'set_campaign_spend_cap' ? { new_value: value } : {}),
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
  // Ô số: ngân sách / giá thầu / giới hạn chi (cùng đơn vị với ngân sách hiện có).
  const initialNumber =
    type === 'set_adset_bid'
      ? targets[0]?.bidAmount
      : type === 'set_campaign_spend_cap'
        ? targets[0]?.spendCap
        : targets[0]?.dailyBudget;
  const [budget, setBudget] = useState(initialNumber ? String(Number(initialNumber)) : '');
  const [previews, setPreviews] = useState<Record<string, Preview | { error: string }> | null>(null);
  const [pending, start] = useTransition();
  // Lỗi khi gửi (quyền ghi, kill switch, quyền duyệt…) theo từng đối tượng — giữ hộp thoại mở để thấy lý do.
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Set<string>>(new Set());
  const key = (x: ActionTarget) => `${x.adAccountId}:${x.metaId}`;
  const isRename = type.startsWith('rename_');
  const [name, setName] = useState(targets[0]?.name ?? '');
  // Hộp thoại có ô nhập (ngân sách / tên mới): xem trước sau khi nhập.
  const isBudget =
    type === 'set_adset_budget' || type === 'set_adset_bid' || type === 'set_campaign_spend_cap' || isRename;
  const numberLabel =
    type === 'set_adset_bid' ? 'newBid' : type === 'set_campaign_spend_cap' ? 'newSpendCap' : 'newBudget';
  const value = isRename ? name : budget;

  const load = () => {
    setPreviews(null);
    setFailures({});
    setSent(new Set());
    Promise.all(
      targets.map((x) =>
        api<Preview>('actions/preview', { method: 'POST', body: body(x, type, value) })
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
          { method: 'POST', body: { items: ready.map((x) => body(x, type, value)) } },
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
      {type === 'pause_campaign' || type === 'resume_campaign' ? (
        <div className="mb-3" data-testid="campaign-note">
          <Banner tone="warning">{t('campaignNote')}</Banner>
        </div>
      ) : null}
      {isRename ? (
        <div className="mb-3 flex items-end gap-2">
          <Field label={t('newName')} htmlFor="grid-name" className="flex-1">
            <Input id="grid-name" value={name} maxLength={400} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button kind="secondary" size="m" disabled={!name.trim() || name.trim() === targets[0]?.name} onClick={load}>
            {t('preview')}
          </Button>
        </div>
      ) : isBudget ? (
        <div className="mb-3 flex items-end gap-2">
          <Field label={t(numberLabel)} htmlFor="grid-budget" className="flex-1">
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
