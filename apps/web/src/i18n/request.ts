import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, toLocale } from './locale';

/** Locale theo cookie `locale` (đặt khi người dùng chọn ngôn ngữ hoặc từ hồ sơ), mặc định vi. */
export default getRequestConfig(async () => {
  const locale = toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Asia/Ho_Chi_Minh',
  };
});
