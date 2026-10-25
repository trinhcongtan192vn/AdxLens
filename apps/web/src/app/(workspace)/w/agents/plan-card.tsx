'use client';

import { Check, CircleDashed, ListChecks, Loader2, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { ZERO_DECIMAL } from '@/lib/actions';

type Ref = string | { ref: string };
type Step = {
  key: string;
  kind: 'create_creative' | 'create_adset' | 'create_ad';
  name: string;
  image_url?: string | null;
  link?: string;
  headline?: string;
  message?: string;
  cta?: string;
  pageId?: string;
  templateAdsetId?: string;
  dailyBudget?: string | null;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  audienceIds?: string[];
  adset?: Ref;
  creative?: Ref;
};
type Plan = {
  id: string;
  title: string;
  status: 'proposed' | 'approved' | 'running' | 'done' | 'failed' | 'canceled';
  account: { id: string; name: string; currency: string };
  steps: Step[];
  results: { key: string; status: 'pending' | 'success' | 'failed' | 'skipped'; code?: string }[];
  expired: boolean;
  can_approve: boolean;
};
type Check = { key: string; ok: boolean; code?: string; violations?: { code: string }[] };

const TONE = {
  proposed: 'info',
  approved: 'info',
  running: 'info',
  done: 'success',
  failed: 'danger',
  canceled: 'neutral',
} as const;

/**
 * ADR-0031: thẻ kế hoạch do agent đề xuất — đủ tham số từng bước (ảnh, nội dung, link, ngân sách, nhắm mục tiêu), duyệt
 * MỘT lần, theo dõi từng bước khi job chạy. Agent không duyệt được; nút chỉ hiện với người có quyền duyệt.
 */
export function PlanCard({ planId }: { planId: string }) {
  const t = useTranslations('wsAgents.plan');
  const format = useFormatter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    try {
      setPlan(await api<Plan>(`action-plans/${planId}`));
    } catch {
      setPlan(null);
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load]);
  // Đang chạy: cập nhật từng bước.
  useEffect(() => {
    if (plan?.status !== 'approved' && plan?.status !== 'running') return;
    const h = setInterval(() => void load(), 3000);
    return () => clearInterval(h);
  }, [plan?.status, load]);

  if (!plan) return null;
  const money = (v: string | null | undefined) => {
    if (!v) return t('campaignBudget');
    const div = ZERO_DECIMAL.has(plan.account.currency) ? 1 : 100;
    return format.number(Number(v) / div, {
      style: 'currency',
      currency: plan.account.currency,
      maximumFractionDigits: div === 1 ? 0 : 2,
    });
  };
  const ref = (v: Ref | undefined) =>
    v == null
      ? '—'
      : typeof v === 'string'
        ? v
        : t('fromStep', { name: plan.steps.find((s) => s.key === v.ref)?.name ?? v.ref });
  const act = (path: 'approve' | 'cancel') =>
    start(async () => {
      try {
        await api(`action-plans/${planId}/${path}`, { method: 'POST' });
        setChecks([]);
        toast.success(t(path === 'approve' ? 'approved' : 'canceled'));
      } catch (e) {
        const c = e instanceof ApiError ? (e.details as { checks?: Check[] } | undefined)?.checks : undefined;
        if (c) setChecks(c);
        toast.error(e instanceof ApiError ? e.message : t('error'));
      }
      await load();
    });

  return (
    <div className="mt-2 rounded-lg border border-brand bg-surface p-3" data-testid="agent-plan">
      <p className="flex flex-wrap items-center gap-2 text-caption font-semibold text-brand">
        <ListChecks className="size-4" aria-hidden />
        {t('title')}
        <Badge tone={plan.expired ? 'neutral' : TONE[plan.status]}>
          {plan.expired ? t('status.expired') : t(`status.${plan.status}`)}
        </Badge>
      </p>
      <p className="mt-1 text-small font-semibold text-fg">{plan.title}</p>
      <p className="text-caption text-fg-tertiary">{plan.account.name}</p>
      <ol className="mt-2 space-y-2">
        {plan.steps.map((s, i) => {
          const r = plan.results.find((x) => x.key === s.key);
          const c = checks.find((x) => x.key === s.key);
          return (
            <li key={s.key} className="rounded-md border border-line p-2 text-small" data-testid="agent-plan-step">
              <p className="flex items-center gap-2 font-medium text-fg">
                <StepIcon status={r?.status ?? 'pending'} running={plan.status === 'running'} />
                {i + 1}. {t(`kinds.${s.kind}`)} · {s.name}
              </p>
              {s.kind === 'create_creative' ? (
                <div className="mt-1 flex gap-2">
                  {s.image_url ? (
                    <img src={s.image_url} alt="" className="size-16 shrink-0 rounded object-cover" />
                  ) : null}
                  <dl className="min-w-0 text-caption text-fg-secondary">
                    <dd className="font-semibold text-fg">{s.headline}</dd>
                    <dd className="whitespace-pre-line">{s.message}</dd>
                    <dd className="truncate">
                      {s.cta} · {s.link}
                    </dd>
                  </dl>
                </div>
              ) : s.kind === 'create_adset' ? (
                <p className="mt-1 text-caption text-fg-secondary">
                  {t('adsetLine', {
                    budget: money(s.dailyBudget),
                    countries: (s.countries ?? []).join(', '),
                    ageMin: s.ageMin ?? 18,
                    ageMax: s.ageMax ?? 65,
                    audiences: s.audienceIds?.length ?? 0,
                  })}
                </p>
              ) : (
                <p className="mt-1 text-caption text-fg-secondary">
                  {t('adLine', { adset: ref(s.adset), creative: ref(s.creative) })}
                </p>
              )}
              {r?.status === 'failed' ? (
                <p className="mt-1 text-caption text-danger">{t('stepFailed', { code: r.code ?? '' })}</p>
              ) : null}
              {c && !c.ok ? (
                <p className="mt-1 text-caption text-danger" data-testid="agent-plan-violation">
                  {(c.violations?.map((v) => v.code) ?? [c.code ?? '']).join(', ')}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-caption text-fg-tertiary">{t('safety')}</p>
      {plan.status === 'proposed' && !plan.expired ? (
        <div className="mt-2 flex gap-2">
          <Button
            kind="primary"
            size="s"
            disabled={pending || !plan.can_approve}
            onClick={() => act('approve')}
            data-testid="agent-plan-approve"
          >
            {t('approve')}
          </Button>
          <Button kind="ghost" size="s" disabled={pending} onClick={() => act('cancel')}>
            {t('cancel')}
          </Button>
          {!plan.can_approve ? (
            <span className="self-center text-caption text-fg-tertiary">{t('noPermission')}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepIcon({ status, running }: { status: string; running: boolean }) {
  if (status === 'success') return <Check className="size-4 text-success" aria-hidden />;
  if (status === 'failed') return <X className="size-4 text-danger" aria-hidden />;
  if (running && status === 'pending') return <Loader2 className="size-4 animate-spin text-fg-tertiary" aria-hidden />;
  return <CircleDashed className="size-4 text-fg-tertiary" aria-hidden />;
}
