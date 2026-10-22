import { getTranslations } from 'next-intl/server';
import { VerifyEmail } from './resend';

export async function generateMetadata() {
  const t = await getTranslations('auth.verify');
  return { title: t('title') };
}

/** A02 Kiểm tra email xác minh. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <VerifyEmail email={email ?? ''} />;
}
