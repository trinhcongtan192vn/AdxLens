'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Conn = { id: string; name: string; status: 'active' | 'expired' | 'revoked'; accounts: number };

/** Danh sách kết nối Meta + S07 hộp thoại "Ngắt kết nối và xóa dữ liệu". */
export function ConnectionList({
  connections,
  purgeDays,
  deadlineDays,
}: {
  connections: Conn[];
  purgeDays: number;
  deadlineDays: number;
}) {
  const t = useTranslations('disconnect');
  const tc = useTranslations('common');
  const router = useRouter();
  const [target, setTarget] = useState<Conn | null>(null);
  const [ack, setAck] = useState(false);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (!target) return;
      try {
        const r = await api<{ confirmation_code: string }>(`connections/${target.id}/disconnect`, { method: 'POST' });
        toast.success(t('done', { code: r.confirmation_code }));
        setTarget(null);
        setAck(false);
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  return (
    <Card className="mt-4">
      <CardHeader title={t('title')} />
      <Table>
        <THead>
          <tr>
            <TH>{t('account')}</TH>
            <TH numeric>{t('accounts')}</TH>
            <TH>{t('status')}</TH>
            <TH className="w-64" />
          </tr>
        </THead>
        <TBody>
          {connections.map((c) => (
            <TR key={c.id}>
              <TD>{c.name}</TD>
              <TD numeric>{c.accounts}</TD>
              <TD>
                <Badge tone={c.status === 'active' ? 'success' : c.status === 'expired' ? 'warning' : 'neutral'}>
                  {t(`statuses.${c.status}`)}
                </Badge>
              </TD>
              <TD className="text-right">
                {c.status !== 'revoked' ? (
                  <Button kind="ghost" size="s" onClick={() => setTarget(c)}>
                    {t('disconnect')}
                  </Button>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Dialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setAck(false);
          }
        }}
        title={t('dialogTitle')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setTarget(null)}>
              {tc('cancel')}
            </Button>
            <Button kind="danger" size="m" disabled={!ack || pending} onClick={submit}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <p className="text-body text-fg">
          {t('dialogBody', { count: target?.accounts ?? 0, days: purgeDays, deadline: deadlineDays })}
        </p>
        <p className="mt-2 text-small text-fg-secondary">{t('facebookHint')}</p>
        <label className="mt-3 flex items-center gap-2 text-body">
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t('understand')}
        </label>
      </Dialog>
    </Card>
  );
}
