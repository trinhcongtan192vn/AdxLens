'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, buttonVariants, Checkbox, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Account = {
  metaAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  spend30d: string | null;
  spendChecked: boolean;
  imported: boolean;
};

export function SelectAccounts({
  connectionId,
  planName,
  limit,
  accounts,
}: {
  connectionId: string;
  planName: string;
  limit: number;
  accounts: Account[];
}) {
  const t = useTranslations('connect');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  // Mặc định chọn sẵn tài khoản có chi tiêu (Penpot S04) và tài khoản đã nhập.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(accounts.filter((a) => a.imported || Number(a.spend30d ?? 0) > 0).map((a) => a.metaAccountId)),
  );
  const loading = accounts.some((a) => !a.spendChecked);

  // Worker đang tính chi tiêu 30 ngày: làm mới trang tới khi xong.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [loading, router]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size) return prev;
      return new Set(accounts.filter((a) => Number(a.spend30d ?? 0) > 0).map((a) => a.metaAccountId));
    });
  }, [accounts]);

  const over = selected.size > limit;
  const sorted = useMemo(
    () => [...accounts].sort((a, b) => Number(b.spend30d ?? 0) - Number(a.spend30d ?? 0)),
    [accounts],
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = () =>
    start(async () => {
      try {
        await api('ad-accounts/import', {
          method: 'POST',
          body: { connection_id: connectionId, meta_account_ids: [...selected] },
        });
        router.push('/connections/assign');
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  if (accounts.length === 0) {
    return (
      <>
        <h1 className="text-h2 font-semibold text-fg">{t('s04Title')}</h1>
        <EmptyState
          title={t('s04EmptyTitle')}
          description={t('s04EmptyBody')}
          action={
            <div className="flex gap-2">
              <Link href="/connections" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
                {tc('back')}
              </Link>
              <a
                href="/api/v1/connections/meta/authorize?scope=read"
                className={buttonVariants({ kind: 'primary', size: 'm' })}
              >
                {t('reconnectMeta')}
              </a>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <h1 className="text-h2 font-semibold text-fg">{t('s04Title')}</h1>
      <p className="mt-3 text-body text-fg-secondary">{t('s04Limit', { plan: planName, limit })}</p>
      {loading ? (
        <p className="mt-3 text-small text-fg-tertiary" role="status">
          {t('s04Loading')}
        </p>
      ) : null}
      <div className="mt-4 rounded-lg border border-line">
        <Table>
          <THead>
            <tr>
              <TH className="w-10" />
              <TH>{t('cols.account')}</TH>
              <TH>{t('cols.id')}</TH>
              <TH>{t('cols.currency')}</TH>
              <TH>{t('cols.timezone')}</TH>
              <TH numeric>{t('cols.spend30d')}</TH>
            </tr>
          </THead>
          <TBody>
            {sorted.map((a) => (
              <TR key={a.metaAccountId} selected={selected.has(a.metaAccountId)}>
                <TD>
                  <Checkbox
                    aria-label={a.name}
                    checked={selected.has(a.metaAccountId)}
                    onChange={() => toggle(a.metaAccountId)}
                  />
                </TD>
                <TD>{a.name}</TD>
                <TD muted>{a.metaAccountId}</TD>
                <TD>{a.currency}</TD>
                <TD>{a.timezone}</TD>
                <TD numeric>
                  {a.spendChecked ? format.number(Number(a.spend30d ?? 0), { maximumFractionDigits: 2 }) : '…'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      {over ? (
        <Banner tone="warning" className="mt-3">
          {t('s04Over', { limit, plan: planName })}
        </Banner>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-small text-fg-secondary">{t('s04Selected', { count: selected.size, limit })}</span>
        <div className="flex-1" />
        <Link href="/connections/new" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {tc('back')}
        </Link>
        <Button kind="primary" size="m" disabled={pending || selected.size === 0} onClick={submit}>
          {tc('next')}
        </Button>
      </div>
    </>
  );
}
