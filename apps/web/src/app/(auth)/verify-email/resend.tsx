'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import { Banner, Button } from '@adxlens/ui';
import { AuthHeading } from '@/components/auth-form';
import { resendVerificationAction } from '../actions';

const COOLDOWN = 60;

/** A02: liên kết hiệu lực 24 giờ; gửi lại sau 60 giây (Penpot). */
export function VerifyEmail({ email }: { email: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(resendVerificationAction, { status: 'idle' });
  const [left, setLeft] = useState(COOLDOWN);

  useEffect(() => {
    if (state.status === 'ok') setLeft(COOLDOWN);
  }, [state]);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  return (
    <div>
      <AuthHeading
        title={t('verify.title')}
        description={t('verify.description', { email: email || t('verify.yourEmail') })}
      />
      {state.status === 'ok' ? (
        <Banner tone="success" className="mb-4">
          {t('verify.resent')}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-3">
        <form action={action}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" kind="secondary" size="m" className="w-full" disabled={pending || left > 0 || !email}>
            {left > 0 ? t('verify.resendIn', { seconds: left }) : t('verify.resend')}
          </Button>
        </form>
        <p className="text-body text-fg-secondary">
          {t('verify.wrongEmail')}{' '}
          <Link href="/signup" className="text-link hover:underline">
            {t('verify.changeEmail')}
          </Link>
        </p>
      </div>
    </div>
  );
}
