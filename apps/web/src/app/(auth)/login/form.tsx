'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button, Field, Input } from '@adxlens/ui';
import { AuthError, AuthHeading } from '@/components/auth-form';
import { signInAction } from '../actions';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(signInAction, { status: 'idle' });
  return (
    <form action={action}>
      <AuthHeading title={t('login.title')} description={t('login.description')} />
      <AuthError state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-3">
        <Field label={t('fields.email')} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('placeholders.email')}
            required
          />
        </Field>
        <Field label={t('fields.password')} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Link href="/forgot-password" className="self-start text-body text-link hover:underline">
          {t('login.forgot')}
        </Link>
        <Button type="submit" kind="primary" size="m" className="w-full" disabled={pending}>
          {pending ? t('working') : t('login.submit')}
        </Button>
        <p className="text-body text-fg-secondary">
          {t('login.noAccount')}{' '}
          <Link href="/signup" className="text-link hover:underline">
            {t('login.signup')}
          </Link>
        </p>
      </div>
    </form>
  );
}
