import 'server-only';
import { createTranslator } from 'next-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { LOCALE_COOKIE, toLocale } from '@/i18n/locale';

export type I18nText = { key: string; params?: Record<string, string | number> };

/** Locale của request API theo cookie (giống trang). */
export function requestLocale(req: Request): 'vi' | 'en' {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return toLocale(m?.[1]) as 'vi' | 'en';
}

/** Dịch văn bản lưu dạng khóa + tham số (ADR-0006). Thiếu khóa → trả lại khóa, không lỗi. */
export function translateText(locale: 'vi' | 'en', text: I18nText): string {
  const t = createTranslator({
    locale,
    messages: locale === 'en' ? en : vi,
    onError: () => {},
    getMessageFallback: ({ key, namespace }) => (namespace ? `${namespace}.${key}` : key),
  });
  return t(text.key as never, text.params as never);
}
