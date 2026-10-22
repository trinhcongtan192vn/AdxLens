'use client';

import { useTranslations } from 'next-intl';
import { StatusPage } from '@/components/status-page';

/** X03 Lỗi chung — có mã lỗi (digest) để báo hỗ trợ, không hiển thị chi tiết nội bộ. */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations();
  return (
    <StatusPage
      code="500"
      title={t('errors.genericTitle')}
      body={t('errors.genericBody')}
      homeLabel={t('errors.goHome')}
      extra={
        error.digest ? (
          <p className="num rounded-sm bg-subtle px-2 py-1 text-small text-fg-secondary">
            {t('common.errorCode', { code: error.digest })}
          </p>
        ) : null
      }
    />
  );
}
