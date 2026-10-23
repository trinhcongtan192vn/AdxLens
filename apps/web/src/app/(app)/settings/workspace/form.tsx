'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, Field, Input, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { COMMON_TIMEZONES, timeZoneLabel } from '@/lib/timezone';

type Initial = {
  name: string;
  timezone: string;
  locale: 'vi' | 'en';
  primaryColor: string;
  reportFromEmail: string;
  logoUrl: string | null;
};

export function WorkspaceForm({ initial }: { initial: Initial }) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState(initial.logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const zones = COMMON_TIMEZONES.includes(initial.timezone)
    ? COMMON_TIMEZONES
    : [initial.timezone, ...COMMON_TIMEZONES];

  const save = (fd: FormData) =>
    start(async () => {
      setErrors({});
      try {
        const email = String(fd.get('reportFromEmail') ?? '').trim();
        await api('workspace', {
          method: 'PATCH',
          body: {
            name: String(fd.get('name') ?? ''),
            defaultTimezone: String(fd.get('timezone')),
            defaultLocale: String(fd.get('locale')),
            primaryColor: String(fd.get('primaryColor') ?? '').trim(),
            reportFromEmail: email || null,
          },
        });
        toast.success(tc('saved'));
        router.refresh();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
          const issues = (e.details.issues as { path: string }[] | undefined) ?? [];
          setErrors(Object.fromEntries(issues.map((i) => [i.path, 'invalid'])));
        } else toast.error(tc('errorGeneric'));
      }
    });

  const uploadLogo = async (file: File) => {
    const form = new FormData();
    form.set('file', file);
    const res = await fetch('/api/v1/workspace/logo', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data?.error?.details?.reason as string | undefined;
      toast.error(t(`logoErrors.${reason ?? 'type'}`));
      return;
    }
    setLogo(data.logo_url);
    toast.success(t('logoUploaded'));
  };

  return (
    <Card className="px-4 py-4">
      <form ref={formRef} action={save} className="flex flex-col gap-3">
        <Field label={t('name')} htmlFor="name" error={errors.name ? t('invalid') : undefined}>
          <Input id="name" name="name" defaultValue={initial.name} maxLength={120} required />
        </Field>
        <Field label={t('timezone')} htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue={initial.timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {timeZoneLabel(z)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('locale')} htmlFor="locale">
          <Select id="locale" name="locale" defaultValue={initial.locale}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </Select>
        </Field>

        <h2 className="pt-1 text-h3 font-semibold text-fg">{t('brandTitle')}</h2>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg bg-subtle">
            {logo ? <img src={logo} alt="" className="max-h-12 max-w-12 object-contain" /> : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
              e.target.value = '';
            }}
          />
          <Button kind="secondary" size="m" onClick={() => fileRef.current?.click()}>
            {t('uploadLogo')}
          </Button>
          <span className="text-small text-fg-tertiary">{t('logoHint')}</span>
        </div>
        <p className="text-small text-fg-tertiary">{t('badgeNote')}</p>
        <Field
          label={t('primaryColor')}
          htmlFor="primaryColor"
          error={errors.primaryColor ? t('colorInvalid') : undefined}
        >
          <Input id="primaryColor" name="primaryColor" defaultValue={initial.primaryColor} pattern="#[0-9a-fA-F]{6}" />
        </Field>
        <Field
          label={t('reportFromEmail')}
          htmlFor="reportFromEmail"
          error={errors.reportFromEmail ? t('invalid') : undefined}
        >
          <Input id="reportFromEmail" name="reportFromEmail" type="email" defaultValue={initial.reportFromEmail} />
        </Field>
        {initial.reportFromEmail ? (
          <Banner tone="warning">
            {t('domainUnverified', { domain: initial.reportFromEmail.split('@')[1] ?? '' })}
          </Banner>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button kind="secondary" size="m" onClick={() => formRef.current?.reset()}>
            {tc('cancel')}
          </Button>
          <Button type="submit" kind="primary" size="m" disabled={pending}>
            {pending ? tc('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
