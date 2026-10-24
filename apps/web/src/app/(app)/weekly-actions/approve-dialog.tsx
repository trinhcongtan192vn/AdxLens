'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Dialog, Skeleton } from '@adxlens/ui';
import { describeChange } from '@/lib/actions';
import { api, ApiError } from '@/lib/api-client';

type Proposal =
  | { executable: false }
  | {
      executable: true;
      action_type: string;
      target: { type: string; meta_id: string; name: string | null };
      account_name: string;
      currency: string;
      before: Record<string, string | null>;
      after: Record<string, string | null>;
      violations: { code: string; params?: Record<string, string | number> }[];
      undoable: boolean;
      warnings: string[];
      can_approve: boolean;
    };

/**
 * P202 Hộp thoại duyệt hành động (P2-03): hiển thị chính xác trước / sau, cảnh báo, vi phạm guardrails; xác
 * nhận → Execution Gateway thực hiện + xác minh; kết quả xem ở Nhật ký hành động.
 */
export function ApproveAction({ recommendationId }: { recommendationId: string }) {
  const router = useRouter();
  const t = useTranslations('approve');
  const ta = useTranslations('actionLog');
  const tc = useTranslations('common');
  const format = useFormatter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    api<Proposal>(`recommendations/${recommendationId}/proposal`)
      .then((p) => alive && setProposal(p))
      .catch(() => alive && setProposal({ executable: false }));
    return () => {
      alive = false;
    };
  }, [recommendationId]);

  if (proposal === null) return <Skeleton className="h-8 w-48" />;
  if (!proposal.executable) return <p className="text-small text-fg-secondary">{t('manualOnly')}</p>;
  const blocked = proposal.violations.length > 0 || !proposal.can_approve;
  const confirm = () =>
    start(async () => {
      try {
        const r = await api<{ action_id: string }>(`recommendations/${recommendationId}/approve`, { method: 'POST' });
        setOpen(false);
        toast.success(t('queued'));
        // Theo dõi kết quả thực hiện + xác minh ở P204.
        router.push(`/action-log/${r.action_id}`);
      } catch (e) {
        toast.error(
          e instanceof ApiError && ta.has(`errors.${e.code}`) ? ta(`errors.${e.code}` as never) : tc('errorGeneric'),
        );
      }
    });
  return (
    <>
      <Button kind="primary" size="m" onClick={() => setOpen(true)} data-testid="approve-open">
        {t('open')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        description={ta(`types.${proposal.action_type}` as never)}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="primary"
              size="m"
              disabled={pending || blocked}
              onClick={confirm}
              data-testid="approve-confirm"
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-fg-secondary">{ta('cols.target')}</dt>
            <dd className="text-fg">
              {proposal.target.name ?? proposal.target.meta_id}{' '}
              <span className="text-fg-secondary">({proposal.target.meta_id})</span>
            </dd>
            <dt className="text-fg-secondary">{ta('cols.account')}</dt>
            <dd className="text-fg">{proposal.account_name}</dd>
            <dt className="text-fg-secondary">{ta('cols.change')}</dt>
            <dd className="num font-semibold text-fg" data-testid="approve-change">
              {describeChange(
                { beforeState: proposal.before, afterExpected: proposal.after, currency: proposal.currency },
                format,
                { t: (k) => ta(k as never) },
              )}
            </dd>
          </dl>
          <p className="text-small text-fg-secondary">{t('beforeNote')}</p>
          {proposal.warnings.map((w) => (
            <Banner key={w} tone="warning">
              {t(`warnings.${w}` as never)}
            </Banner>
          ))}
          {proposal.violations.map((v) => (
            <Banner key={v.code} tone="danger">
              {t.has(`violations.${v.code}`) ? t(`violations.${v.code}` as never, v.params as never) : v.code}
            </Banner>
          ))}
          {!proposal.can_approve ? <Banner tone="info">{t('noPermission')}</Banner> : null}
          <p className="text-small text-fg-secondary">{t('safety')}</p>
        </div>
      </Dialog>
    </>
  );
}
