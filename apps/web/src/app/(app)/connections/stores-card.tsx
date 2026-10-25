'use client';

import { Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Select, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Item = {
  id: string;
  provider: 'shopify' | 'ga4';
  name: string;
  externalId: string;
  clientId: string | null;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/**
 * ADR-0029: cửa hàng / analytics (Shopify; GA4 ở bước sau) — kết nối theo shop, gắn Client, ngắt kết nối (xóa token và
 * số liệu ngày). Số liệu hiện ở Business Dashboard.
 */
export function StoresCard({
  items,
  clients,
  shopifyEnabled,
}: {
  items: Item[];
  clients: { id: string; name: string }[];
  shopifyEnabled: boolean;
}) {
  const t = useTranslations('stores');
  const format = useFormatter();
  const router = useRouter();
  const [shop, setShop] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [pending, start] = useTransition();
  const connect = () => {
    const q = new URLSearchParams({ shop: shop.trim(), ...(clientId ? { client_id: clientId } : {}) });
    window.location.href = `/api/v1/stores/shopify/authorize?${q.toString()}`;
  };
  const assign = (id: string, c: string) =>
    start(async () => {
      await api(`stores/${id}`, { method: 'PATCH', body: { client_id: c || null } });
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      await api(`stores/${id}`, { method: 'DELETE' });
      toast.success(t('removed'));
      router.refresh();
    });

  return (
    <Card className="mt-4" data-testid="stores-card">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Store className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 max-w-3xl text-small text-fg-secondary">{t('intro')}</p>

      {items.length ? (
        <Table className="mt-3">
          <THead>
            <tr>
              <TH>{t('cols.store')}</TH>
              <TH>{t('cols.client')}</TH>
              <TH>{t('cols.sync')}</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {items.map((s) => (
              <TR key={s.id}>
                <TD>
                  <span className="font-medium">{s.name}</span>{' '}
                  <span className="text-caption text-fg-tertiary">
                    {t(`providers.${s.provider}`)} · {s.externalId}
                  </span>
                </TD>
                <TD>
                  <Select
                    aria-label={t('cols.client')}
                    value={s.clientId ?? ''}
                    disabled={pending}
                    onChange={(e) => assign(s.id, e.target.value)}
                  >
                    <option value="">{t('noClient')}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  {s.status === 'error' ? (
                    <Badge tone="danger">{t('reconnect')}</Badge>
                  ) : s.lastSyncedAt ? (
                    <span className="text-small text-fg-secondary">
                      {format.dateTime(new Date(s.lastSyncedAt), { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  ) : (
                    <Badge tone="info">{t('syncing')}</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <Button kind="ghost" size="s" disabled={pending} onClick={() => remove(s.id)}>
                    {t('disconnect')}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}

      {shopifyEnabled ? (
        <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('shop')} htmlFor="st-shop" hint={t('shopHint')}>
            <Input
              id="st-shop"
              value={shop}
              placeholder="ten-shop.myshopify.com"
              onChange={(e) => setShop(e.target.value)}
            />
          </Field>
          <Field label={t('cols.client')} htmlFor="st-client">
            <Select id="st-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{t('noClient')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button kind="primary" size="m" disabled={!shop.trim()} onClick={connect} data-testid="connect-shopify">
            {t('connectShopify')}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-small text-fg-tertiary">{t('notConfigured')}</p>
      )}
    </Card>
  );
}
