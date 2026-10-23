'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardHeader,
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
import { api } from '@/lib/api-client';

type LinkRow = {
  id: string;
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
};

/** R04: tạo link (hạn, mật khẩu), danh sách link (sao chép, thu hồi, lượt xem). */
export function ShareManager({
  reportId,
  canCreate,
  links,
}: {
  reportId: string;
  canCreate: boolean;
  links: LinkRow[];
}) {
  const t = useTranslations('share');
  const tc = useTranslations('common');
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const [expiry, setExpiry] = useState<'none' | '7' | '30' | '90'>('30');
  const [password, setPassword] = useState('');
  const [pending, start] = useTransition();

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    toast.success(t('copied'));
  };

  const create = () =>
    start(async () => {
      try {
        const r = await api<{ url: string }>(`reports/${reportId}/share-links`, {
          method: 'POST',
          body: { expires_in_days: expiry === 'none' ? null : Number(expiry), ...(password ? { password } : {}) },
        });
        setPassword('');
        await copy(r.url);
        toast.success(t('created'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="px-4 py-4">
        <h2 className="text-h3 font-semibold text-fg">{t('create')}</h2>
        <div className="mt-3 flex flex-col gap-3">
          <Field label={t('expiry')} htmlFor="share-expiry">
            <Select
              id="share-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as typeof expiry)}
              disabled={!canCreate}
            >
              {(['none', '7', '30', '90'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`expiries.${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('password')} htmlFor="share-password">
            <Input
              id="share-password"
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!canCreate}
            />
          </Field>
          <Button
            kind="primary"
            size="m"
            disabled={!canCreate || pending || (password.length > 0 && password.length < 6)}
            onClick={create}
          >
            {t('create')}
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title={t('links')} />
        {links.length === 0 ? (
          <EmptyState title={t('noLinks')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.link')}</TH>
                <TH>{t('cols.expires')}</TH>
                <TH numeric>{t('cols.views')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH className="w-40" />
              </tr>
            </THead>
            <TBody>
              {links.map((l) => {
                const expired = l.expiresAt !== null && new Date(l.expiresAt) <= now;
                const live = !l.revokedAt && !expired;
                return (
                  <TR key={l.id}>
                    <TD className="max-w-64 truncate" title={l.url}>
                      <span className="text-small text-fg-secondary">{l.url}</span>
                      {l.hasPassword ? (
                        <Badge tone="neutral" className="ml-2">
                          {t('withPassword')}
                        </Badge>
                      ) : null}
                    </TD>
                    <TD muted>
                      {l.expiresAt
                        ? format.dateTime(new Date(l.expiresAt), { dateStyle: 'short' })
                        : t('expiries.none')}
                    </TD>
                    <TD numeric>{l.viewCount}</TD>
                    <TD>
                      <Badge tone={live ? 'success' : 'neutral'}>
                        {l.revokedAt ? t('revoked') : expired ? t('expired') : t('active')}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {live ? (
                        <span className="flex justify-end gap-1">
                          <Button kind="ghost" size="s" onClick={() => copy(l.url)}>
                            {t('copy')}
                          </Button>
                          <Button
                            kind="ghost"
                            size="s"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                await api(`share-links/${l.id}`, { method: 'DELETE' }).catch(() =>
                                  toast.error(tc('errorGeneric')),
                                );
                                router.refresh();
                              })
                            }
                          >
                            {t('revoke')}
                          </Button>
                        </span>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
