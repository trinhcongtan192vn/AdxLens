'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, buttonVariants, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { ReconBadge } from '@/components/recon-badge';
import { api } from '@/lib/api-client';
import { summarizeSync, type AccountSync } from '@/lib/sync-progress';

type Row = AccountSync & {
  id: string;
  name: string;
  recon: { status: 'ok' | 'warning' | 'pending'; pct: string | null };
};

export function SyncProgress({ accounts }: { accounts: Row[] }) {
  const t = useTranslations('sync');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = summarizeSync(accounts);
  const waitingRecon = s.allDone && accounts.some((a) => a.recon.status === 'pending');

  // Worker đang đồng bộ: làm mới tới khi xong.
  useEffect(() => {
    if (!s.active && !waitingRecon) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [s.active, waitingRecon, router]);

  const retry = () =>
    start(async () => {
      try {
        for (const a of accounts.filter((x) => x.status === 'failed')) {
          await api(`ad-accounts/${a.id}/sync`, { method: 'POST' });
        }
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  if (accounts.length === 0) {
    return (
      <EmptyState
        title={t('emptyTitle')}
        action={
          <Link href="/connections/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('connect')}
          </Link>
        }
      />
    );
  }

  return (
    <>
      {s.error ? (
        <Banner tone="danger" className="mb-3">
          {t(`errors.${s.error}`, { percent: s.percent })}
        </Banner>
      ) : null}
      <div
        className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-valuenow={s.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('title')}
      >
        <div className="h-full bg-brand transition-all" style={{ width: `${s.percent}%` }} />
      </div>
      <h1 className="text-h2 font-semibold text-fg">{s.allDone ? t('doneTitle') : t('title')}</h1>
      <p className="mt-2 text-small text-fg-secondary" role="status">
        {t('summary', { percent: s.percent, done: s.accountsDone, total: s.accountsTotal })}
      </p>
      <div className="mt-3 rounded-lg border border-line">
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.account')}</TH>
              <TH>{t('cols.progress')}</TH>
              <TH>{t('cols.reconciliation')}</TH>
            </tr>
          </THead>
          <TBody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD>{a.name}</TD>
                <TD>
                  {a.status === 'succeeded' ? (
                    <Badge tone="success">{t('status.done')}</Badge>
                  ) : a.status === 'failed' ? (
                    <Badge tone="danger">{t('status.failed')}</Badge>
                  ) : (
                    <Badge tone="info">
                      {t('status.running', {
                        percent: a.daysTotal ? Math.floor((a.daysDone / a.daysTotal) * 100) : 0,
                      })}
                    </Badge>
                  )}
                </TD>
                <TD>
                  {a.recon.status === 'pending' ? (
                    <span className="text-fg-tertiary">—</span>
                  ) : (
                    <ReconBadge status={a.recon.status} pct={a.recon.pct} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {tc('back')}
        </Link>
        {s.allDone ? (
          <Link href="/clients" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {tc('next')}
          </Link>
        ) : (
          // Không bắt chờ: vào trang chủ ngay, đồng bộ tiếp ở nền và số liệu hiện dần.
          <Link href="/overview" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('continueBackground')}
          </Link>
        )}
        {s.failedCount > 0 && s.error !== 'META_TOKEN_INVALID' ? (
          <Button kind="primary" size="m" disabled={pending} onClick={retry}>
            {t('retry')}
          </Button>
        ) : null}
        {s.error === 'META_TOKEN_INVALID' ? (
          <a
            href="/api/v1/connections/meta/authorize?scope=read"
            className={buttonVariants({ kind: 'primary', size: 'm' })}
          >
            {t('reconnect')}
          </a>
        ) : null}
      </div>
    </>
  );
}
