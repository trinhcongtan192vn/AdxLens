import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, buttonVariants } from '@adxlens/ui';
import { canResetPassword } from '@/server/supabase-auth';
import { ResetForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('auth.reset');
  return { title: t('title') };
}

/** A05 Đặt lại mật khẩu; không có phiên từ link (hết hạn) → A05 · hết hạn. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth.reset');
  if (sp.expired || !(await canResetPassword())) {
    return (
      <div className="flex flex-col gap-3">
        <Badge tone="warning" className="self-start">
          {t('expiredBadge')}
        </Badge>
        <h1 className="text-h2 font-semibold text-fg">{t('expiredTitle')}</h1>
        <p className="text-body text-fg-secondary">{t('expiredBody')}</p>
        <Link href="/forgot-password" className={buttonVariants({ kind: 'primary', size: 'm' })}>
          {t('sendNew')}
        </Link>
      </div>
    );
  }
  return <ResetForm />;
}
