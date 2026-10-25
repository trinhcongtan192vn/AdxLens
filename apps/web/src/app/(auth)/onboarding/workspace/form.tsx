'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { Banner, Button, Field, Input, Select } from '@adxlens/ui';
import { AuthHeading } from '@/components/auth-form';
import { api, ApiError } from '@/lib/api-client';
import { canonicalTimeZone, COMMON_CURRENCIES, COMMON_TIMEZONES, timeZoneLabel } from '@/lib/timezone';

export function CreateWorkspaceForm({ locale, another = false }: { locale: 'vi' | 'en'; another?: boolean }) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Mặc định VN khi render phía server; đọc múi giờ trình duyệt sau khi mount (không dùng múi giờ máy chủ).
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  useEffect(() => {
    const tz = canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    if (tz) setTimezone(tz);
  }, []);
  const zones = COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await api('workspaces', {
              method: 'POST',
              body: {
                name: String(fd.get('name') ?? ''),
                timezone: String(fd.get('timezone')),
                currency: String(fd.get('currency')),
                locale,
              },
            });
            router.push('/w');
            router.refresh();
          } catch (err) {
            setError(
              err instanceof ApiError && err.status === 422
                ? t('invalid')
                : err instanceof ApiError && err.status === 402
                  ? t('freeLimit')
                  : t('error'),
            );
          }
        });
      }}
    >
      <AuthHeading title={t('title')} description={t('description')} />
      {another ? (
        <Banner tone="info" className="mb-4">
          {t('another')}{' '}
          <Link href="/clients" className="text-link underline">
            {t('toClients')}
          </Link>
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="danger" className="mb-4">
          {error}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-3">
        <Field label={t('name')} htmlFor="name">
          <Input id="name" name="name" placeholder={t('namePlaceholder')} maxLength={120} required />
        </Field>
        <Field label={t('timezone')} htmlFor="timezone">
          <Select id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {timeZoneLabel(z)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('currency')} htmlFor="currency" hint={t('note')}>
          <Select id="currency" name="currency" defaultValue="VND">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" kind="primary" size="m" className="w-full" disabled={pending}>
          {pending ? t('working') : t('submit')}
        </Button>
        {another ? (
          <Link href="/w" className="text-center text-body text-link hover:underline">
            {t('back')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
