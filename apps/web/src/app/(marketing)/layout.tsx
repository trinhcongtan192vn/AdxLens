import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { buttonVariants } from '@adxlens/ui';
import { LocaleSwitch } from '@/components/locale-switch';

/** Khung trang công khai M01–M06 (Penpot): header, footer chung. */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('marketing');
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1344px] items-center gap-5 px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="size-6 rounded-md bg-brand" aria-hidden />
            <span className="text-h3 font-semibold text-brand">AdxLens</span>
          </Link>
          <div className="flex-1" />
          <nav className="flex items-center gap-5 text-body text-fg-secondary">
            <Link href="/pricing" className="hover:text-fg">
              {t('nav.pricing')}
            </Link>
            <Link href="/#how-it-works" className="hover:text-fg">
              {t('nav.guide')}
            </Link>
            <Link href="/privacy" className="hover:text-fg">
              {t('nav.privacy')}
            </Link>
          </nav>
          <LocaleSwitch />
          <Link href="/login" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
            {t('nav.login')}
          </Link>
          <Link href="/signup" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('cta.tryFree')}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex h-12 max-w-[1344px] items-center gap-5 px-6 text-small text-fg-secondary">
          <span>{t('footer.copyright', { year: 2026 })}</span>
          <div className="flex-1" />
          <Link href="/privacy" className="hover:text-fg">
            {t('nav.privacy')}
          </Link>
          <Link href="/terms" className="hover:text-fg">
            {t('footer.terms')}
          </Link>
          <Link href="/data-deletion" className="hover:text-fg">
            {t('footer.dataDeletion')}
          </Link>
          <a href="mailto:support@adxlens.com" className="hover:text-fg">
            {t('footer.support')}
          </a>
        </div>
      </footer>
    </div>
  );
}
