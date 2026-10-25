'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button, Checkbox, Field, Input } from '@adxlens/ui';
import { AuthError, AuthHeading, fieldError } from '@/components/auth-form';
import { MIN_PASSWORD } from '@/server/auth-flows';
import { signUpAction } from '../actions';

export function SignUpForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(signUpAction, { status: 'idle' });
  const pwErr = fieldError(state, 'password');
  return (
    <form action={action} noValidate>
      <AuthHeading title={t('signup.title')} description={t('signup.description')} />
      <AuthError state={state} />
      <div className="flex flex-col gap-3">
        <Field label={t('fields.fullName')} htmlFor="fullName">
          <Input id="fullName" name="fullName" autoComplete="name" placeholder={t('placeholders.fullName')} required />
        </Field>
        <Field
          label={t('fields.workEmail')}
          htmlFor="email"
          error={fieldError(state, 'email') === 'invalid' ? t('fieldErrors.email') : undefined}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('placeholders.email')}
            aria-invalid={Boolean(fieldError(state, 'email'))}
            required
          />
        </Field>
        <Field
          label={t('fields.password')}
          htmlFor="password"
          hint={t('passwordHint', { min: MIN_PASSWORD })}
          error={pwErr ? t('passwordHint', { min: MIN_PASSWORD }) : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            placeholder={t('placeholders.password', { min: MIN_PASSWORD })}
            aria-invalid={Boolean(pwErr)}
            required
          />
        </Field>
        <label className="flex items-center gap-2 text-body text-fg-secondary">
          <Checkbox name="acceptTerms" required />
          <span>
            {t.rich('signup.acceptTerms', {
              terms: (c) => (
                <Link href="/terms" className="text-link hover:underline" target="_blank">
                  {c}
                </Link>
              ),
              privacy: (c) => (
                <Link href="/privacy" className="text-link hover:underline" target="_blank">
                  {c}
                </Link>
              ),
            })}
          </span>
        </label>
        <Button type="submit" kind="primary" size="m" className="w-full" disabled={pending}>
          {pending ? t('working') : t('signup.submit')}
        </Button>
        <p className="text-body text-fg-secondary">
          {t('signup.haveAccount')}{' '}
          <Link href="/login" className="text-link hover:underline">
            {t('login.submit')}
          </Link>
        </p>
      </div>
    </form>
  );
}
