'use client';

import { Building2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Banner,
  Button,
  buttonVariants,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { ReconBadge } from '@/components/recon-badge';
import { api } from '@/lib/api-client';
import { filterClients, type ClientRow } from '@/lib/clients';

const AUTHORIZE = '/api/v1/connections/meta/authorize?scope=read';

export function ClientsTable({
  clients,
  unconfirmed,
  canManage,
}: {
  clients: ClientRow[];
  unconfirmed: number;
  canManage: boolean;
}) {
  const t = useTranslations('clients');
  const format = useFormatter();
  const tc = useTranslations('common');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  const rows = useMemo(() => filterClients(clients, q), [clients, q]);
  const accountCount = clients.reduce((n, c) => n + c.accounts.length, 0);

  const create = () =>
    start(async () => {
      try {
        const c = await api<{ id: string }>('clients', { method: 'POST', body: { name } });
        setOpen(false);
        setName('');
        router.push(`/clients/${c.id}`);
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  const addButton = canManage ? (
    <Button kind="primary" size="m" onClick={() => setOpen(true)}>
      {t('addClient')}
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t('c01Title')}
            <Badge tone="neutral">{t('c01Count', { clients: clients.length, accounts: accountCount })}</Badge>
          </span>
        }
        actions={addButton}
      />
      {unconfirmed > 0 && canManage ? (
        <Banner
          tone="warning"
          className="mb-3"
          action={
            <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
              {t('confirmAssign')}
            </Link>
          }
        >
          {t('unconfirmedBanner', { count: unconfirmed })}
        </Banner>
      ) : null}

      {clients.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 />} title={t('emptyTitle')} description={t('emptyBody')} action={addButton} />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
              <Input
                aria-label={t('search')}
                placeholder={t('search')}
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.client')}</TH>
                  <TH>{t('cols.adAccounts')}</TH>
                  <TH numeric>{t('cols.spend30d')}</TH>
                  <TH>{t('cols.health')}</TH>
                  <TH numeric>{t('cols.highIssues')}</TH>
                  <TH>{t('cols.reconciliation')}</TH>
                  <TH>{t('cols.lastReport')}</TH>
                  <TH className="w-36" />
                </tr>
              </THead>
              <TBody>
                {rows.map((c) => {
                  const needConfirm = c.accounts.some((a) => !a.confirmed);
                  const expired = c.accounts.some((a) => a.expired);
                  return (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`/clients/${c.id}`} className="font-medium text-fg hover:text-brand">
                          {c.name}
                        </Link>
                      </TD>
                      <TD>
                        <span title={c.accounts.map((a) => a.name).join(', ')}>
                          {t('accountsCount', { count: c.accounts.length })}
                        </span>
                      </TD>
                      <TD numeric>
                        {Object.entries(c.spend30 ?? {})
                          .map(
                            ([cur, v]) =>
                              `${format.number(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })} ${cur}`,
                          )
                          .join(' · ') || '—'}
                      </TD>
                      <TD>
                        {c.health === null || c.health === undefined ? (
                          <span className="text-fg-tertiary">—</span>
                        ) : (
                          <Badge tone={c.health >= 80 ? 'success' : c.health >= 60 ? 'warning' : 'danger'}>
                            {c.health}
                          </Badge>
                        )}
                      </TD>
                      <TD numeric>{c.highIssues || '—'}</TD>
                      <TD>
                        {c.recon && c.recon.status !== 'pending' ? (
                          <Link href={`/clients/${c.id}/reconciliation`}>
                            <ReconBadge status={c.recon.status} pct={c.recon.maxSpendDeltaPct} />
                          </Link>
                        ) : (
                          <span className="text-fg-tertiary">—</span>
                        )}
                      </TD>
                      <TD muted>—</TD>
                      <TD className="text-right">
                        {canManage && needConfirm ? (
                          <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
                            {t('confirmAssign')}
                          </Link>
                        ) : canManage && expired ? (
                          <a href={AUTHORIZE} className={buttonVariants({ kind: 'secondary', size: 's' })}>
                            {t('reconnect')}
                          </a>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
                {rows.length === 0 ? (
                  <TR>
                    <TD colSpan={8} muted className="text-center">
                      {t('noResults', { q })}
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </Card>
          <SourceFootnote className="mt-2">{t('footnote')}</SourceFootnote>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('newClientTitle')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="primary" size="m" disabled={pending || !name.trim()} onClick={create}>
              {tc('create')}
            </Button>
          </>
        }
      >
        <Field label={t('nameLabel')} htmlFor="client-name">
          <Input id="client-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </>
  );
}
