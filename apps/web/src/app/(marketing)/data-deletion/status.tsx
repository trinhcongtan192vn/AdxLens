import { getTranslations } from 'next-intl/server';
import { Banner } from '@adxlens/ui';
import { lookupDeletionStatus } from '@/server/deletion-status';

/** Trạng thái yêu cầu xóa theo mã xác nhận. Mã sai → "không tìm thấy", không lộ gì thêm. */
export async function DeletionStatus({ code }: { code: string }) {
  const t = await getTranslations('marketing.deletion.track');
  const status = await lookupDeletionStatus(code);
  if (!status) {
    return (
      <Banner tone="warning" className="mt-3">
        {t('notFound')}
      </Banner>
    );
  }
  return (
    <Banner tone={status === 'done' ? 'success' : 'info'} className="mt-3">
      {t(`status.${status}`)}
    </Banner>
  );
}
