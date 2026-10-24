'use client';

import { Copy, Plug } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';

export type GrantView = {
  id: string;
  clientName: string;
  scopes: string[];
  mine: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

/**
 * Connector MCP có OAuth (ADR-0022 B): user thêm URL vào claude.ai / Claude Desktop / ChatGPT, đăng nhập AdxLens và
 * chat bằng gói Claude / ChatGPT của chính họ. Danh sách ứng dụng đã kết nối + thu hồi.
 */
export function ConnectorCard({ endpoint, grants }: { endpoint: string; grants: GrantView[] }) {
  const t = useTranslations('integrations.connector');
  const ti = useTranslations('integrations');
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const cli = `claude mcp add --transport http adxlens ${endpoint}`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ti('copied'));
    } catch {
      /* trình duyệt chặn clipboard */
    }
  };

  return (
    <Card data-testid="mcp-connector-card">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Plug className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 max-w-2xl text-small text-fg-secondary">{t('intro')}</p>
      <div className="mt-3 flex max-w-2xl items-center gap-2">
        <code
          className="flex-1 break-all rounded bg-subtle px-2 py-1 font-mono text-caption"
          data-testid="mcp-connector-url"
        >
          {endpoint}
        </code>
        <Button kind="secondary" size="s" onClick={() => copy(endpoint)} aria-label={ti('copy')}>
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {(['claude', 'chatgpt', 'code'] as const).map((k) => (
          <div key={k} className="rounded-lg border border-line p-3">
            <p className="text-small font-semibold text-fg">{t(`steps.${k}.title`)}</p>
            <p className="mt-1 text-caption text-fg-secondary">{t(`steps.${k}.body`)}</p>
            {k === 'code' ? (
              <button
                type="button"
                className="mt-2 block w-full break-all rounded bg-subtle px-2 py-1 text-left font-mono text-caption hover:bg-hover"
                onClick={() => copy(cli)}
              >
                {cli}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-h4 font-semibold text-fg">{t('connected')}</h3>
      {grants.length === 0 ? (
        <p className="mt-1 text-small text-fg-tertiary">{t('none')}</p>
      ) : (
        <Table className="mt-2" data-testid="oauth-grants">
          <THead>
            <tr>
              <TH>{t('cols.app')}</TH>
              <TH>{t('cols.scopes')}</TH>
              <TH>{t('cols.lastUsed')}</TH>
              <TH>{t('cols.connected')}</TH>
              <TH className="w-28" />
            </tr>
          </THead>
          <TBody>
            {grants.map((g) => (
              <TR key={g.id}>
                <TD>
                  {g.clientName}
                  {g.mine ? <span className="ml-1 text-caption text-fg-tertiary">({t('mine')})</span> : null}
                </TD>
                <TD>
                  {g.scopes.map((s) => (
                    <Badge key={s} tone="neutral" className="mr-1">
                      {ti(`scopes.${s}`)}
                    </Badge>
                  ))}
                </TD>
                <TD>
                  {g.lastUsedAt
                    ? format.dateTime(new Date(g.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </TD>
                <TD>{format.dateTime(new Date(g.createdAt), { dateStyle: 'medium' })}</TD>
                <TD className="text-right">
                  <Button
                    kind="secondary"
                    size="s"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await api(`oauth/grants/${g.id}`, { method: 'DELETE' });
                        toast.success(t('revoked'));
                        router.refresh();
                      })
                    }
                  >
                    {ti('revoke')}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
