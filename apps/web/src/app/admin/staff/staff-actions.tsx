'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, Dialog, Field, Input, Select, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Role = 'superadmin' | 'operator';
const ROLES: Role[] = ['operator', 'superadmin'];

function useSubmit() {
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, done: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(done);
        after?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  return { pending, run };
}

/** Superadmin thêm staff theo email người dùng đã có tài khoản AdxLens. */
export function AddStaffForm() {
  const t = useTranslations('admin');
  const { pending, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [reason, setReason] = useState('');
  return (
    <Card className="mb-4 max-w-[720px] px-4 py-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => api('admin/staff', { method: 'POST', body: { email, role, reason } }),
            t('staff.added'),
            () => {
              setEmail('');
              setReason('');
            },
          );
        }}
      >
        <Field label={t('staff.cols.email')} htmlFor="staff-email" className="w-64">
          <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('staff.cols.role')} htmlFor="staff-role" className="w-40">
          <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('staff.reason')} htmlFor="staff-reason" className="min-w-56 flex-1">
          <Input id="staff-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button kind="primary" size="m" type="submit" disabled={pending || !email || reason.trim().length < 5}>
          {t('staff.add')}
        </Button>
      </form>
      <p className="mt-2 text-small text-fg-tertiary">{t('staff.addHint')}</p>
    </Card>
  );
}

/** Đổi vai trò / gỡ quyền một staff (superadmin), luôn cần lý do. */
export function StaffRowActions({ userId, email, role }: { userId: string; email: string; role: Role }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { pending, run } = useSubmit();
  const [mode, setMode] = useState<'role' | 'remove' | null>(null);
  const [reason, setReason] = useState('');
  const next: Role = role === 'superadmin' ? 'operator' : 'superadmin';
  const close = () => {
    setMode(null);
    setReason('');
  };
  const submit = () =>
    mode === 'role'
      ? run(
          () => api(`admin/staff/${userId}`, { method: 'PATCH', body: { role: next, reason } }),
          t('staff.updated'),
          close,
        )
      : run(
          () => api(`admin/staff/${userId}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }),
          t('staff.removed'),
          close,
        );
  return (
    <div className="flex gap-2">
      <Button kind="secondary" size="s" onClick={() => setMode('role')}>
        {t('staff.makeRole', { role: t(`roles.${next}`) })}
      </Button>
      <Button kind="ghost" size="s" onClick={() => setMode('remove')}>
        {t('staff.remove')}
      </Button>
      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && close()}
        title={
          mode === 'role'
            ? t('staff.roleTitle', { email, role: t(`roles.${next}`) })
            : t('staff.removeTitle', { email })
        }
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={close}>
              {tc('cancel')}
            </Button>
            <Button
              kind={mode === 'remove' ? 'danger' : 'primary'}
              size="m"
              disabled={pending || reason.trim().length < 5}
              onClick={submit}
            >
              {mode === 'remove' ? t('staff.remove') : t('staff.confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('staff.reason')} htmlFor={`reason-${userId}`}>
          <Textarea id={`reason-${userId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}
