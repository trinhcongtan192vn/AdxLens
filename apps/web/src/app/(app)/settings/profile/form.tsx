'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, Dialog, Field, Input, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

export function ProfileForm({ initial }: { initial: { fullName: string; email: string; locale: 'vi' | 'en' } }) {
  const t = useTranslations('settingsProfile');
  const tc = useTranslations('common');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <Card className="max-w-[720px] px-4 py-4">
      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            try {
              await api('me/profile', {
                method: 'PATCH',
                body: { fullName: String(fd.get('fullName') ?? ''), locale: String(fd.get('locale')) },
              });
              toast.success(tc('saved'));
              router.refresh();
            } catch {
              toast.error(tc('errorGeneric'));
            }
          })
        }
        className="flex flex-col gap-3"
      >
        <Field label={t('fullName')} htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={initial.fullName} maxLength={120} required />
        </Field>
        <Field label={t('email')} htmlFor="email">
          <Input id="email" value={initial.email} disabled readOnly />
        </Field>
        <Field label={t('language')} htmlFor="locale">
          <Select id="locale" name="locale" defaultValue={initial.locale}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={t('password')}>
          <Button kind="secondary" size="m" className="self-start" onClick={() => setPwOpen(true)}>
            {t('changePassword')}
          </Button>
        </Field>
        <h2 className="pt-1 text-h3 font-semibold text-fg">{t('sessions')}</h2>
        <p className="text-body text-fg-secondary">{t('currentSession')}</p>
        <Button
          kind="secondary"
          size="m"
          className="self-start"
          onClick={() =>
            start(async () => {
              await api('me/sessions', { method: 'DELETE' });
              toast.success(t('signedOutOthers'));
            })
          }
        >
          {t('signOutOthers')}
        </Button>
        <div className="flex justify-end gap-2">
          <Button kind="secondary" size="m" onClick={() => formRef.current?.reset()}>
            {tc('cancel')}
          </Button>
          <Button type="submit" kind="primary" size="m" disabled={pending}>
            {tc('save')}
          </Button>
        </div>
      </form>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </Card>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations('settingsProfile');
  const tc = useTranslations('common');
  const [form, setForm] = useState({ currentPassword: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('changePassword')}
      closeLabel={tc('close')}
      footer={
        <>
          <Button kind="secondary" size="m" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            kind="primary"
            size="m"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await api('me/password', { method: 'POST', body: form });
                  toast.success(t('passwordChanged'));
                  onOpenChange(false);
                  setForm({ currentPassword: '', password: '', confirm: '' });
                } catch (e) {
                  setError(
                    e instanceof ApiError && e.code === 'FORBIDDEN'
                      ? t('wrongCurrent')
                      : e instanceof ApiError && e.code === 'VALIDATION_FAILED'
                        ? t('passwordRule')
                        : tc('errorGeneric'),
                  );
                }
              })
            }
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className="text-small text-danger">{error}</p> : null}
        <Field label={t('currentPassword')} htmlFor="cur">
          <Input
            id="cur"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={set('currentPassword')}
          />
        </Field>
        <Field label={t('newPassword')} htmlFor="new" hint={t('passwordRule')}>
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Field label={t('confirmPassword')} htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
          />
        </Field>
      </div>
    </Dialog>
  );
}
