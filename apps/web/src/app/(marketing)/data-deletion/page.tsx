import { getTranslations } from 'next-intl/server';
import { Button, Field, Input } from '@adxlens/ui';
import { LegalPage } from '@/components/legal-page';
import { DeletionStatus } from './status';

export async function generateMetadata() {
  const t = await getTranslations('marketing.deletion');
  return { title: t('title') };
}

/**
 * M05 Hướng dẫn xóa dữ liệu (Meta yêu cầu khi duyệt app). Tra cứu mã xác nhận của yêu cầu xóa
 * (data deletion callback, L3 5.5).
 */
export default async function DataDeletion({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const t = await getTranslations('marketing.deletion');
  const { code } = await searchParams;
  return (
    <LegalPage
      title={t('title')}
      intro={t('intro')}
      sections={[
        { title: t('inApp.title'), body: t('inApp.body') },
        { title: t('fromFacebook.title'), body: t('fromFacebook.body') },
      ]}
    >
      <section className="mt-6 rounded-lg border border-line bg-canvas px-4 py-4">
        <h2 className="text-h3 font-semibold text-fg">{t('track.title')}</h2>
        <p className="mt-1 text-body text-fg-secondary">{t('track.body')}</p>
        <form method="get" className="mt-3 flex items-end gap-2">
          <Field label={t('track.code')} htmlFor="code" className="w-64">
            <Input
              id="code"
              name="code"
              defaultValue={code ?? ''}
              placeholder="XD-7F3A21C9"
              required
            />
          </Field>
          <Button type="submit" kind="secondary" size="s">
            {t('track.submit')}
          </Button>
        </form>
        {code ? <DeletionStatus code={code} /> : null}
      </section>
    </LegalPage>
  );
}
