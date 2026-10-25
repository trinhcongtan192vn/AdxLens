'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Checkbox, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Item = { kind: string; mandatory: boolean; inApp: boolean; email: boolean };

export function NotificationSettingsForm({ items }: { items: Item[] }) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const [rows, setRows] = useState(items);
  const [pending, start] = useTransition();
  const set = (kind: string, key: 'inApp' | 'email', v: boolean) =>
    setRows((rs) => rs.map((r) => (r.kind === kind ? { ...r, [key]: v } : r)));
  const save = () =>
    start(async () => {
      try {
        await api('me/notification-settings', {
          method: 'PATCH',
          body: {
            items: rows.filter((r) => !r.mandatory).map((r) => ({ kind: r.kind, in_app: r.inApp, email: r.email })),
          },
        });
        toast.success(t('settings.saved'));
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return (
    <Card>
      <div className="px-4 pt-4">
        <h2 className="text-h3 font-semibold text-fg">{t('settings.title')}</h2>
        <p className="mt-1 text-body text-fg-secondary">{t('settings.intro')}</p>
      </div>
      <Table className="mt-3">
        <THead>
          <tr>
            <TH>{t('settings.kind')}</TH>
            <TH className="w-28">{t('settings.inApp')}</TH>
            <TH className="w-28">{t('settings.email')}</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.kind}>
              <TD>
                {t(`kinds.${r.kind}.label` as never)}
                {r.mandatory ? (
                  <Badge tone="neutral" className="ml-2">
                    {t('settings.always')}
                  </Badge>
                ) : null}
              </TD>
              <TD>
                <Checkbox
                  aria-label={`${t(`kinds.${r.kind}.label` as never)} · ${t('settings.inApp')}`}
                  checked={r.inApp}
                  disabled={r.mandatory}
                  onChange={(e) => set(r.kind, 'inApp', e.target.checked)}
                />
              </TD>
              <TD>
                <Checkbox
                  aria-label={`${t(`kinds.${r.kind}.label` as never)} · ${t('settings.email')}`}
                  checked={r.email}
                  disabled={r.mandatory}
                  onChange={(e) => set(r.kind, 'email', e.target.checked)}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex justify-end px-4 py-3">
        <Button kind="primary" size="m" disabled={pending} onClick={save}>
          {t('settings.save')}
        </Button>
      </div>
    </Card>
  );
}
