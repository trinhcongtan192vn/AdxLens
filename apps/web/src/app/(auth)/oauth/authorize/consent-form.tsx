'use client';

import { Check, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Banner, Button, Field, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** Màn đồng ý của connector MCP: ứng dụng nào, workspace nào, được làm gì. */
export function ConsentForm({
  clientName,
  email,
  workspaces,
  defaultWorkspaceId,
  scopes,
  params,
}: {
  clientName: string;
  email: string;
  workspaces: { id: string; name: string; enabled: boolean }[];
  defaultWorkspaceId: string;
  scopes: string[];
  params: Record<string, string>;
}) {
  const t = useTranslations('oauthConsent');
  const [ws, setWs] = useState(defaultWorkspaceId);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const enabled = workspaces.find((w) => w.id === ws)?.enabled ?? false;

  // Từ chối không cần gọi server: redirect_uri đã được trang kiểm với danh sách đã đăng ký.
  const deny = () => {
    const url = new URL(params.redirect_uri!);
    url.searchParams.set('error', 'access_denied');
    if (params.state) url.searchParams.set('state', params.state);
    window.location.href = url.toString();
  };
  const allow = () =>
    start(async () => {
      setError(false);
      try {
        const r = await api<{ redirect: string }>('oauth/authorize', {
          method: 'POST',
          workspaceId: ws,
          body: { ...params, state: params.state || undefined, scope: params.scope || undefined, decision: 'allow' },
        });
        window.location.href = r.redirect;
      } catch {
        setError(true);
      }
    });

  return (
    <div data-testid="oauth-consent">
      <h1 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <ShieldCheck className="size-5 text-brand" aria-hidden />
        {t('title', { app: clientName })}
      </h1>
      <p className="mt-1 text-small text-fg-secondary">{t('signedInAs', { email })}</p>

      <Field label={t('workspace')} className="mt-4">
        <Select value={ws} onChange={(e) => setWs(e.target.value)} aria-label={t('workspace')}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>

      <p className="mt-4 text-small font-medium text-fg">{t('willAllow', { app: clientName })}</p>
      <ul className="mt-1 space-y-1 text-small text-fg-secondary">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t('scopeRead')}
        </li>
        {scopes.includes('propose') ? (
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {t('scopePropose')}
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-caption text-fg-tertiary">{t('never')}</p>

      {!enabled ? (
        <Banner tone="warning" className="mt-3">
          {t('disabled')}
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="danger" className="mt-3">
          {t('error')}
        </Banner>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Button kind="primary" size="m" className="flex-1" disabled={pending || !enabled} onClick={allow}>
          {t('allow')}
        </Button>
        <Button kind="secondary" size="m" disabled={pending} onClick={deny}>
          {t('deny')}
        </Button>
      </div>
    </div>
  );
}
