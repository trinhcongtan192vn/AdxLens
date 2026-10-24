import { getTranslations } from 'next-intl/server';
import { StatusPage } from '@/components/status-page';

/**
 * F-state: chỉ dùng khi mở thẳng URL màn P1/P2 lúc tính năng chưa bật (ux-requirements EC15).
 * Không hiển thị tên cờ hay mã giai đoạn (CLAUDE.md quy tắc 7).
 */
export default async function FeatureUnavailable() {
  const t = await getTranslations('errors');
  return (
    <StatusPage
      code="—"
      title={t('featureUnavailableTitle')}
      body={t('featureUnavailableBody')}
      homeLabel={t('goHome')}
    />
  );
}
