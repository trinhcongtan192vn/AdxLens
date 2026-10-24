'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Banner, Button, Card, Field, Input } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** R06: nhập mật khẩu link chia sẻ. */
export function PasswordForm({ token }: { token: string }) {
  const t = useTranslations('publicReport');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card className="mx-auto max-w-sm px-4 py-5">
      <h1 className="text-h2 font-semibold text-fg">{t('passwordTitle')}</h1>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              await api(`/api/v1/public/share/${token}/unlock`, { method: 'POST', body: { password } });
              router.refresh();
            } catch {
              setError(true);
            }
          });
        }}
      >
        <Field label={t('passwordLabel')} htmlFor="share-password">
          <Input
            id="share-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
          />
        </Field>
        {error ? <Banner tone="danger">{t('wrongPassword')}</Banner> : null}
        <Button type="submit" kind="primary" size="m" disabled={pending || !password}>
          {t('open')}
        </Button>
      </form>
    </Card>
  );
}
