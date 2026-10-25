'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useTransition } from 'react';
import { Banner, Button, Field, Input, buttonVariants } from '@adxlens/ui';
import { MIN_PASSWORD } from '@/server/auth-flows';
import { acceptAsCurrentUser, registerAndAccept, type InviteState } from './actions';

export function AcceptInvite({
  token,
  mode,
  email,
}: {
  token: string;
  mode: 'accept' | 'register' | 'login' | 'wrongAccount';
  email: string;
}) {
  const t = useTranslations('invite');
  const [regState, regAction, regPending] = useActionState(registerAndAccept.bind(null, token), {
    status: 'idle',
  } as InviteState);
  const [pending, start] = useTransition();

  const error = regState.status === 'error' ? t(`errors.${regState.code}`, { min: MIN_PASSWORD }) : null;

  if (mode === 'login') {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
        className={buttonVariants({ kind: 'primary', size: 'm', className: 'w-full' })}
      >
        {t('loginToAccept')}
      </Link>
    );
  }

  if (mode === 'wrongAccount') {
    return (
      <Banner tone="warning" title={t('wrongAccountTitle')}>
        {t('wrongAccountBody', { email })}
      </Banner>
    );
  }

  if (mode === 'accept') {
    return (
      <Button
        kind="primary"
        size="m"
        className="w-full"
        disabled={pending}
        onClick={() => start(async () => void (await acceptAsCurrentUser(token)))}
      >
        {t('accept')}
      </Button>
    );
  }

  return (
    <form action={regAction} className="flex flex-col gap-3">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Field label={t('fullName')} htmlFor="fullName">
        <Input id="fullName" name="fullName" autoComplete="name" placeholder={t('fullNamePlaceholder')} required />
      </Field>
      <Field label={t('password')} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          placeholder={t('passwordPlaceholder', { min: MIN_PASSWORD })}
          required
        />
      </Field>
      <Button type="submit" kind="primary" size="m" className="w-full" disabled={regPending}>
        {t('accept')}
      </Button>
    </form>
  );
}
