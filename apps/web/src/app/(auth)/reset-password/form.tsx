'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button, Field, Input } from '@adxlens/ui';
import { AuthError, AuthHeading, fieldError } from '@/components/auth-form';
import { MIN_PASSWORD } from '@/server/auth-flows';
import { resetPasswordAction } from '../actions';

export function ResetForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(resetPasswordAction, { status: 'idle' });
  return (
    <form action={action}>
      <AuthHeading title={t('reset.title')} />
      <AuthError state={state} />
      <div className="flex flex-col gap-3">
        <Field
          label={t('reset.newPassword')}
          htmlFor="password"
          error={fieldError(state, 'password') ? t('passwordHint', { min: MIN_PASSWORD }) : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            placeholder={t('placeholders.password', { min: MIN_PASSWORD })}
            required
          />
        </Field>
        <Field
          label={t('reset.confirm')}
          htmlFor="confirm"
          error={fieldError(state, 'confirm') ? t('fieldErrors.mismatch') : undefined}
        >
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <p className="text-small text-fg-tertiary">{t('reset.note')}</p>
        <Button type="submit" kind="primary" size="m" className="w-full" disabled={pending}>
          {pending ? t('working') : t('reset.submit')}
        </Button>
      </div>
    </form>
  );
}
