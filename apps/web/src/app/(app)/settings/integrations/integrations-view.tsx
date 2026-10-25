'use client';

import { Copy, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
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

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** Khóa API MCP: tạo (hiện khóa một lần + cấu hình mẫu), thu hồi. */
export function IntegrationsView({
  endpoint,
  keys,
  canPropose,
}: {
  endpoint: string;
  keys: Key[];
  canPropose: boolean;
}) {
  const t = useTranslations('integrations');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Claude');
  const [propose, setPropose] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const config = (key: string) =>
    JSON.stringify(
      { mcpServers: { adxlens: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${key}` } } } },
      null,
      2,
    );
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      /* trình duyệt chặn clipboard */
    }
  };
  const date = (s: string | null) =>
    s ? format.dateTime(new Date(s), { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 font-semibold text-fg">{t('title')}</h2>
            <p className="mt-1 max-w-2xl text-small text-fg-secondary">{t('intro')}</p>
            <p className="mt-2 text-small text-fg-secondary">
              {t('endpoint')} <code className="rounded bg-subtle px-1 font-mono text-caption">{endpoint}</code>
            </p>
          </div>
          <Button
            kind="primary"
            size="m"
            onClick={() => {
              setCreated(null);
              setOpen(true);
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            {t('create')}
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-0">
        {keys.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.name')}</TH>
                <TH>{t('cols.key')}</TH>
                <TH>{t('cols.scopes')}</TH>
                <TH>{t('cols.lastUsed')}</TH>
                <TH>{t('cols.created')}</TH>
                <TH className="w-28" />
              </tr>
            </THead>
            <TBody>
              {keys.map((k) => (
                <TR key={k.id}>
                  <TD>{k.name}</TD>
                  <TD>
                    <code className="font-mono text-caption">adx_{k.prefix}_…</code>
                  </TD>
                  <TD>
                    {k.scopes.map((s) => (
                      <Badge key={s} tone="neutral" className="mr-1">
                        {t(`scopes.${s}`)}
                      </Badge>
                    ))}
                  </TD>
                  <TD>{date(k.lastUsedAt)}</TD>
                  <TD>{date(k.createdAt)}</TD>
                  <TD className="text-right">
                    {k.revokedAt ? (
                      <Badge tone="neutral">{t('revoked')}</Badge>
                    ) : (
                      <Button
                        kind="secondary"
                        size="s"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await api(`api-keys/${k.id}`, { method: 'DELETE' });
                            toast.success(t('revokedToast'));
                            router.refresh();
                          })
                        }
                      >
                        {t('revoke')}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={created ? t('createdTitle') : t('create')}
        closeLabel={tc('close')}
        footer={
          created ? (
            <Button kind="primary" size="m" onClick={() => setOpen(false)}>
              {t('done')}
            </Button>
          ) : (
            <Button
              kind="primary"
              size="m"
              disabled={pending || !name.trim()}
              onClick={() =>
                start(async () => {
                  try {
                    const r = await api<{ key: string }>('api-keys', {
                      method: 'POST',
                      body: { name, scopes: propose ? ['read', 'propose'] : ['read'] },
                    });
                    setCreated(r.key);
                    router.refresh();
                  } catch {
                    toast.error(t('error'));
                  }
                })
              }
            >
              {t('create')}
            </Button>
          )
        }
      >
        {created ? (
          <>
            <Banner tone="warning">{t('once')}</Banner>
            <div className="mt-3 flex items-center gap-2">
              <code
                className="flex-1 break-all rounded bg-subtle px-2 py-1 font-mono text-caption"
                data-testid="api-key-plain"
              >
                {created}
              </code>
              <Button kind="secondary" size="s" onClick={() => copy(created)} aria-label={t('copy')}>
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="mt-3 text-small font-medium text-fg">{t('configTitle')}</p>
            <pre className="mt-1 overflow-x-auto rounded bg-subtle p-2 font-mono text-caption">{config(created)}</pre>
            <Button kind="ghost" size="s" className="mt-1" onClick={() => copy(config(created))}>
              {t('copyConfig')}
            </Button>
            <p className="mt-2 text-caption text-fg-tertiary">{t('claudeCode', { url: endpoint })}</p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t('cols.name')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                aria-label={t('cols.name')}
              />
            </Field>
            <label className="flex items-start gap-2 text-small text-fg">
              <Checkbox checked={propose} disabled={!canPropose} onChange={(e) => setPropose(e.target.checked)} />
              <span>
                {t('proposeLabel')}
                <span className="block text-caption text-fg-tertiary">
                  {canPropose ? t('proposeHint') : t('proposeOff')}
                </span>
              </span>
            </label>
          </div>
        )}
      </Dialog>
    </>
  );
}
