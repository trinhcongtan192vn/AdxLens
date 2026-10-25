'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Banner } from '@adxlens/ui';
import type { FormState } from '@/server/auth-flows';

/** Tiêu đề + mô tả của màn xác thực. */
export function AuthHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-h2 font-semibold text-fg">{title}</h1>
      {description ? <p className="mt-2 text-body text-fg-secondary">{description}</p> : null}
    </div>
  );
}

/** Banner lỗi theo mã lỗi luồng xác thực (thông điệp không tiết lộ email tồn tại). */
export function AuthError({ state }: { state: FormState }) {
  const t = useTranslations('auth.errors');
  if (state.status !== 'error') return null;
  let text: string;
  if (state.code === 'invalid_credentials' && state.remaining !== undefined) {
    text = t('invalid_credentials_remaining', { remaining: state.remaining });
  } else if (state.code === 'locked') {
    text = t('locked', { minutes: state.minutesLeft ?? 15 });
  } else {
    text = t(state.code);
  }
  return (
    <Banner tone="danger" className="mb-4">
      {text}
    </Banner>
  );
}

export function fieldError(state: FormState, field: string): string | undefined {
  return state.status === 'error' ? state.fields?.[field] : undefined;
}
