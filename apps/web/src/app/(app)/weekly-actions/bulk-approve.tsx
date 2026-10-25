'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Dialog, Skeleton } from '@adxlens/ui';
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
      can_approve: boolean;
    };
type Result = { id: string; ok: boolean; code?: string; message?: string };

/**
 * B2: xem trước rồi duyệt nhiều gợi ý cùng lúc. Mỗi gợi ý hiện trước → sau và vi phạm guardrails; chỉ gửi những gợi
 * ý thực hiện được. Gateway vẫn kiểm lại từng cái (số hành động / ngày tính dần) và trả kết quả từng cái.
 */
export function BulkApprove({
  ids,
  labels,
  onDone,
}: {
  ids: string[];
  labels: Record<string, string>;
  onDone: () => void;
}) {
  const t = useTranslations('approve');
  const ta = useTranslations('actionLog');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [proposals, setProposals] = useState<Record<string, Proposal> | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setProposals(null);
    setResults(null);
    let alive = true;
    Promise.all(
      ids.map((id) =>
        api<Proposal>(`recommendations/${id}/proposal`)
          .then((p) => [id, p] as const)
          .catch(() => [id, { executable: false } as Proposal] as const),
      ),
    ).then((rows) => alive && setProposals(Object.fromEntries(rows)));
    return () => {
      alive = false;
    };
  }, [open, ids]);

  const ready = proposals
    ? ids.filter((id) => {
        const p = proposals[id];
        return p?.executable && p.can_approve && p.violations.length === 0;
      })
    : [];

  const confirm = () =>
    start(async () => {
      try {
        const r = await api<{ approved: number; items: Result[] }>('recommendations/bulk-approve', {
          method: 'POST',
          body: { ids: ready },
        });
        setResults(r.items);
        toast.success(t('bulkQueued', { count: r.approved }));
        router.refresh();
        if (r.items.every((x) => x.ok)) {
          setOpen(false);
          onDone();
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  return (
    <>
      <Button kind="primary" size="s" disabled={!ids.length} onClick={() => setOpen(true)} data-testid="bulk-approve">
        {t('bulkButton', { count: ids.length })}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('bulkTitle', { count: ids.length })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="primary" size="m" disabled={pending || !ready.length || results !== null} onClick={confirm}>
              {t('bulkConfirm', { count: ready.length })}
            </Button>
          </>
        }
      >
        <Banner tone="info" className="mb-3">
          {t('bulkNote')}
        </Banner>
        {proposals === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto" data-testid="bulk-list">
            {ids.map((id) => {
              const p = proposals[id]!;
              const r = results?.find((x) => x.id === id);
              return (
                <li key={id} className="rounded-md border border-line px-3 py-2 text-body">
                  <p className="font-medium">{labels[id] ?? id}</p>
                  {!p.executable ? (
                    <p className="text-small text-fg-tertiary">{t('manualOnly')}</p>
                  ) : (
                    <>
                      <p className="text-small text-fg-secondary">
                        {ta(`types.${p.action_type}` as never)} · {p.target.name ?? p.target.meta_id} · {p.account_name}
                      </p>
                      <p className="num text-small">
                        {describeChange(
                          { beforeState: p.before, afterExpected: p.after, currency: p.currency },
                          format,
                          { t: (k) => ta(k as never) },
                        )}
                      </p>
                      {p.violations.length ? (
                        <p className="text-small text-danger">
                          {p.violations.map((v) => t(`violations.${v.code}` as never, v.params as never)).join(' · ')}
                        </p>
                      ) : !p.can_approve ? (
                        <p className="text-small text-danger">{t('noPermission')}</p>
                      ) : null}
                    </>
                  )}
                  {r ? (
                    <Badge tone={r.ok ? 'success' : 'danger'} className="mt-1">
                      {r.ok ? t('bulkOk') : (r.message ?? r.code)}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
