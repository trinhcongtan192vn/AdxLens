'use client';

import { Copy, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Dialog, Field, Input, Segmented, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Link = {
  id: string;
  clientId: string;
  token: string;
  periodDays: number;
  hasPassword: boolean;
  expiresAt: string | null;
  revoked: boolean;
  views: number;
};

/**
 * ADR-0028: link Business Dashboard công khai cho khách (theo Client, 7 / 30 ngày, mật khẩu / hạn tùy chọn, thu hồi).
 * Trang tự khóa khi số liệu chưa toàn vẹn (như link báo cáo).
 */
export function BusinessShare({
  base,
  clients,
  links,
}: {
  base: string;
  clients: { id: string; name: string }[];
  links: Link[];
}) {
  const t = useTranslations('wsBusiness.shareLink');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [period, setPeriod] = useState<'7' | '30'>('30');
  const [expiry, setExpiry] = useState<'' | '7' | '30' | '90'>('');
  const [password, setPassword] = useState('');
  const [pending, start] = useTransition();
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? '—';
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${base}/${token}`);
      toast.success(t('copied'));
    } catch {
      /* trình duyệt chặn clipboard */
    }
  };
  const create = () =>
    start(async () => {
      try {
        const r = await api<{ token: string }>('business-links', {
          method: 'POST',
          body: {
            client_id: clientId,
            period_days: Number(period),
            expires_in_days: expiry ? Number(expiry) : null,
            password: password || null,
          },
        });
        setPassword('');
        await copy(r.token);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  const revoke = (id: string) =>
    start(async () => {
      await api(`business-links/${id}`, { method: 'DELETE' });
      toast.success(t('revoked'));
      router.refresh();
    });

  return (
    <>
      <Button kind="secondary" size="s" onClick={() => setOpen(true)} data-testid="business-share">
        <Share2 className="size-4" aria-hidden />
        {t('button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t('title')} closeLabel={tc('close')}>
        <p className="text-small text-fg-secondary">{t('intro')}</p>
        {clients.length ? (
          <div className="mt-3 flex flex-col gap-3">
            <Field label={t('client')} htmlFor="bl-client">
              <Select id="bl-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-small font-medium text-fg-secondary">{t('period')}</p>
                <Segmented
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: '7', label: t('days', { n: 7 }) },
                    { value: '30', label: t('days', { n: 30 }) },
                  ]}
                />
              </div>
              <Field label={t('expiry')} htmlFor="bl-exp">
                <Select id="bl-exp" value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)}>
                  <option value="">{t('never')}</option>
                  {(['7', '30', '90'] as const).map((d) => (
                    <option key={d} value={d}>
                      {t('days', { n: Number(d) })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('password')} htmlFor="bl-pass">
              <Input
                id="bl-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button
              kind="primary"
              size="m"
              disabled={pending || !clientId || (password.length > 0 && password.length < 6)}
              onClick={create}
              data-testid="business-share-create"
            >
              {t('create')}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-small text-fg-tertiary">{t('noClient')}</p>
        )}
        {links.length ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3" data-testid="business-links">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-small">
                <span className="font-medium text-fg">{name(l.clientId)}</span>
                <span className="text-fg-tertiary">· {t('days', { n: l.periodDays })}</span>
                {l.hasPassword ? <Badge>{t('protected')}</Badge> : null}
                {l.revoked ? <Badge tone="neutral">{t('revokedBadge')}</Badge> : null}
                <span className="text-caption text-fg-tertiary">{t('views', { n: l.views })}</span>
                {!l.revoked ? (
                  <span className="ml-auto flex gap-1">
                    <Button kind="ghost" size="s" onClick={() => copy(l.token)} aria-label={t('copy')}>
                      <Copy className="size-4" aria-hidden />
                    </Button>
                    <Button kind="ghost" size="s" disabled={pending} onClick={() => revoke(l.id)}>
                      {t('revoke')}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>
    </>
  );
}
