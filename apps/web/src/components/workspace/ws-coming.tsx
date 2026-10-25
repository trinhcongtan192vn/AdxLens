import { getTranslations } from 'next-intl/server';
import { Card, EmptyState } from '@adxlens/ui';

/** Trang Workspace đang dựng (điền ở các đợt W4–W10 cùng đêm). */
export async function WsComing({ title }: { title: string }) {
  const t = await getTranslations('ws');
  return (
    <>
      <h1 className="mb-4 text-h2 font-semibold text-fg">{title}</h1>
      <Card>
        <EmptyState title={title} description={t('coming')} />
      </Card>
    </>
  );
}
