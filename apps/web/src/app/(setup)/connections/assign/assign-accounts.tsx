'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Banner,
  Button,
  buttonVariants,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { ApiError, api } from '@/lib/api-client';
import { assignBody, decodeChoice, defaultChoice, encodeChoice, isNameMatch, type AssignChoice } from '@/lib/assign';

type Account = {
  id: string;
  name: string;
  metaAccountId: string;
  clientId: string | null;
  suggestedClientName: string | null;
  assignmentStatus: string;
};

export function AssignAccounts({
  accounts,
  clients,
}: {
  accounts: Account[];
  clients: { id: string; name: string }[];
}) {
  const t = useTranslations('clients');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choices, setChoices] = useState<Record<string, AssignChoice>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, defaultChoice(a)])),
  );
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const remaining = accounts.filter((a) => a.assignmentStatus !== 'confirmed').length;

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError && e.status === 409 ? t('conflict') : tc('errorGeneric'));
      }
    });

  const confirm = (a: Account) => {
    const body = assignBody(choices[a.id] ?? { kind: 'none' });
    if (!body) return;
    run(() => api(`ad-accounts/${a.id}/assign`, { method: 'POST', body }));
  };

  const unassign = (a: Account) => {
    // Sau khi bỏ gán, giữ Client cũ làm lựa chọn mặc định để đổi nhanh.
    if (a.clientId) setChoices((s) => ({ ...s, [a.id]: { kind: 'existing', clientId: a.clientId! } }));
    run(() => api(`ad-accounts/${a.id}/assign`, { method: 'DELETE' }));
  };

  const createClient = () =>
    run(async () => {
      await api('clients', { method: 'POST', body: { name: newName } });
      setNewOpen(false);
      setNewName('');
    });

  return (
    <>
      <h1 className="text-h2 font-semibold text-fg">{t('s05Title')}</h1>
      <p className="mt-3 text-body text-fg-secondary">{t('s05Intro')}</p>
      {accounts.length === 0 ? (
        <EmptyState title={t('s05Empty')} />
      ) : (
        <div className="mt-4 rounded-lg border border-line">
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.account')}</TH>
                <TH>{t('cols.suggestion')}</TH>
                <TH className="w-64">{t('cols.client')}</TH>
                <TH className="w-40">{t('cols.confirm')}</TH>
              </tr>
            </THead>
            <TBody>
              {accounts.map((a) => {
                const choice = choices[a.id] ?? { kind: 'none' };
                const done = a.assignmentStatus === 'confirmed';
                const current = clients.find((c) => c.id === a.clientId);
                return (
                  <TR key={a.id} data-testid={`assign-row-${a.metaAccountId}`}>
                    <TD>
                      <div className="text-fg">{a.name}</div>
                      <div className="text-caption text-fg-tertiary">{a.metaAccountId}</div>
                    </TD>
                    <TD>{isNameMatch(a) ? <Badge tone="info">{t('matchName')}</Badge> : null}</TD>
                    <TD>
                      {done ? (
                        <span className="text-fg">{current?.name ?? '—'}</span>
                      ) : (
                        <Select
                          aria-label={t('cols.client')}
                          value={encodeChoice(choice)}
                          onChange={(e) => setChoices((s) => ({ ...s, [a.id]: decodeChoice(e.target.value) }))}
                        >
                          <option value="">{t('chooseClient')}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={`c:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                          {a.suggestedClientName && !clients.some((c) => c.name === a.suggestedClientName) ? (
                            <option value={`n:${a.suggestedClientName}`}>
                              {t('newClientOption', { name: a.suggestedClientName })}
                            </option>
                          ) : null}
                        </Select>
                      )}
                    </TD>
                    <TD>
                      {done ? (
                        <span className="flex items-center gap-2">
                          <Badge tone="success">{t('confirmed')}</Badge>
                          <button
                            type="button"
                            className="text-small text-brand hover:underline"
                            disabled={pending}
                            onClick={() => unassign(a)}
                          >
                            {t('change')}
                          </button>
                        </span>
                      ) : (
                        <Button
                          kind="secondary"
                          size="s"
                          disabled={pending || choice.kind === 'none'}
                          onClick={() => confirm(a)}
                        >
                          {tc('confirm')}
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
      {remaining > 0 ? (
        <Banner tone="info" className="mt-3">
          {t('s05Remaining', { count: remaining })}
        </Banner>
      ) : accounts.length ? (
        <Banner tone="success" className="mt-3">
          {t('s05AllDone')}
        </Banner>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="text-body text-brand hover:underline" onClick={() => setNewOpen(true)}>
          {t('createClient')}
        </button>
        <div className="flex-1" />
        <Link href="/connections" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {tc('back')}
        </Link>
        <Link href="/connections/sync" className={buttonVariants({ kind: 'primary', size: 'm' })}>
          {t('finish')}
        </Link>
      </div>
      <Dialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title={t('newClientTitle')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setNewOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="primary" size="m" disabled={pending || !newName.trim()} onClick={createClient}>
              {tc('create')}
            </Button>
          </>
        }
      >
        <Field label={t('nameLabel')} htmlFor="new-client-name">
          <Input
            id="new-client-name"
            value={newName}
            maxLength={120}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
        </Field>
      </Dialog>
    </>
  );
}
