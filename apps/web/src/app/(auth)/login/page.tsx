import { getTranslations } from 'next-intl/server';
import { Banner } from '@adxlens/ui';
import { LoginForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

/** A03 Đăng nhập. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; expired?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  return (
    <>
      {sp.expired ? (
        <Banner tone="warning" className="mb-4">
          {t('errors.link_expired')}
        </Banner>
      ) : null}
      <LoginForm next={sp.next ?? ''} />
    </>
  );
}
