import { getTranslations } from 'next-intl/server';
import { SignUpForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('auth.signup');
  return { title: t('title') };
}

/** A01 Đăng ký. */
export default function SignUpPage() {
  return <SignUpForm />;
}
