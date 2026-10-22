'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { LOCALE_COOKIE } from '@/i18n/locale';

/** Đổi ngôn ngữ trang công khai (cookie, không cần đăng nhập). */
export function LocaleSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const next = locale === 'vi' ? 'en' : 'vi';
  return (
    <button
      type="button"
      className="text-small font-medium uppercase text-fg-tertiary hover:text-fg"
      aria-label={next === 'en' ? 'English' : 'Tiếng Việt'}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {next}
    </button>
  );
}
