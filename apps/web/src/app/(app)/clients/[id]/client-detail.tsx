'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { api } from '@/lib/api-client';

function useAction() {
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return { pending, run, router };
}

/** Đổi tên / lưu trữ Client (owner, manager). */
export function ClientActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations('clients');
  const tc = useTranslations('common');
  const { pending, run, router } = useAction();
  const [mode, setMode] = useState<'rename' | 'archive' | null>(null);
  const [value, setValue] = useState(name);

  return (
    <>
      <Button kind="secondary" size="m" onClick={() => setMode('rename')}>
        {t('rename')}
      </Button>
      <Button kind="secondary" size="m" onClick={() => setMode('archive')}>
        {t('archive')}
      </Button>
      <Dialog
        open={mode === 'rename'}
        onOpenChange={(o) => setMode(o ? 'rename' : null)}
        title={t('rename')}
        closeLabel={tc('close')}
        footer={
          <Button
            kind="primary"
            size="m"
            disabled={pending || !value.trim()}
            onClick={() =>
              run(
                () => api(`clients/${id}`, { method: 'PATCH', body: { name: value } }),
                () => setMode(null),
              )
            }
          >
            {tc('save')}
          </Button>
        }
      >
        <Field label={t('nameLabel')} htmlFor="rename-client">
          <Input id="rename-client" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={mode === 'archive'}
        onOpenChange={(o) => setMode(o ? 'archive' : null)}
        title={t('archive')}
        description={t('archiveConfirm', { name })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setMode(null)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="danger"
              size="m"
              disabled={pending}
              onClick={() =>
                run(
                  () => api(`clients/${id}`, { method: 'DELETE' }),
                  () => router.push('/clients'),
                )
              }
            >
              {t('archive')}
            </Button>
          </>
        }
      />
    </>
  );
}

/** Tab Cài đặt: tài khoản QC của Client, bỏ gán. */
export function ClientAccounts({
  accounts,
  canManage,
}: {
  accounts: { id: string; name: string; metaAccountId: string; confirmed: boolean }[];
  canManage: boolean;
}) {
  const t = useTranslations('clients');
  const { pending, run } = useAction();
  return (
    <Card>
      <CardHeader title={t('c02Accounts')} />
      {accounts.length === 0 ? (
        <EmptyState title={t('noAccounts')} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.account')}</TH>
              <TH>{t('cols.confirm')}</TH>
              <TH className="w-28" />
            </tr>
          </THead>
          <TBody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD>
                  <div>{a.name}</div>
                  <div className="text-caption text-fg-tertiary">{a.metaAccountId}</div>
                </TD>
                <TD>
                  <Badge tone={a.confirmed ? 'success' : 'warning'}>
                    {a.confirmed ? t('confirmed') : t('confirmAssign')}
                  </Badge>
                </TD>
                <TD className="text-right">
                  {canManage ? (
                    <Button
                      kind="secondary"
                      size="s"
                      disabled={pending}
                      onClick={() => run(() => api(`ad-accounts/${a.id}/assign`, { method: 'DELETE' }))}
                    >
                      {t('unassign')}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
