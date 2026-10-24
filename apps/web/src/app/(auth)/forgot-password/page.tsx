'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Banner, Button, Field, Input } from '@adxlens/ui';
import { AuthError, AuthHeading } from '@/components/auth-form';
import { forgotPasswordAction } from '../actions';

/** A04 Quên mật khẩu: luôn báo "đã gửi nếu email tồn tại". */
export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(forgotPasswordAction, { status: 'idle' });
  return (
    <form action={action}>
      <AuthHeading title={t('forgot.title')} description={t('forgot.description')} />
      {state.status === 'ok' ? (
        <Banner tone="success" className="mb-4">
          {t('forgot.sent')}
        </Banner>
      ) : (
        <AuthError state={state} />
      )}
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
        <Button type="submit" kind="primary" size="m" className="w-full" disabled={pending}>
          {pending ? t('working') : t('forgot.submit')}
        </Button>
        <Link href="/login" className="text-body text-link hover:underline">
          {t('forgot.back')}
        </Link>
      </div>
    </form>
  );
}
