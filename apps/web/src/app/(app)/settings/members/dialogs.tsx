'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Checkbox, Dialog, Field, Input, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

export type ClientOpt = { id: string; name: string };
export type Member = {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  clientAccess: string[];
  approveClientIds: string[];
};

function ClientPicker({
  clients,
  value,
  onChange,
  label,
}: {
  clients: ClientOpt[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 text-small font-medium text-fg-secondary">{label}</legend>
      <div className="max-h-48 overflow-y-auto rounded-md border border-line px-2 py-1">
        {clients.length === 0 ? <p className="py-1 text-small text-fg-tertiary">—</p> : null}
        {clients.map((c) => (
          <label key={c.id} className="flex h-7 items-center gap-2 text-body">
            <Checkbox checked={value.includes(c.id)} onChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "+ Mời thành viên": email, vai trò, Client được gán. */
export function InviteDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: ClientOpt[];
}) {
  const t = useTranslations('settingsMembers');
  const tc = useTranslations('common');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'buyer'>('buyer');
  const [access, setAccess] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        await api('members/invitations', { method: 'POST', body: { email, role, clientAccess: access } });
        toast.success(t('invited', { email }));
        onOpenChange(false);
        setEmail('');
        setAccess([]);
        router.refresh();
      } catch (e) {
        setError(e instanceof ApiError && e.code === 'CONFLICT' ? t('alreadyMember') : t('inviteError'));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('inviteTitle')}
      closeLabel={tc('close')}
      footer={
        <>
          <Button kind="secondary" size="m" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button kind="primary" size="m" disabled={pending || !email} onClick={submit}>
            {t('sendInvite')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label={t('cols.email')} htmlFor="invite-email">
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('cols.role')} htmlFor="invite-role" hint={t(`roleHints.${role}`)}>
          <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'buyer')}>
            <option value="manager">{t('roles.manager')}</option>
            <option value="buyer">{t('roles.buyer')}</option>
          </Select>
        </Field>
        <ClientPicker
          clients={clients}
          value={access}
          onChange={setAccess}
          label={role === 'manager' ? t('clientsOptionalManager') : t('clientsForBuyer')}
        />
      </div>
    </Dialog>
  );
}

/** "Sửa" thành viên: vai trò, Client, quyền duyệt theo Client (khi P2 bật), xóa, chuyển quyền owner. */
export function EditMemberDialog({
  member,
  clients,
  showApprove,
  isSelf,
  onClose,
}: {
  member: Member;
  clients: ClientOpt[];
  showApprove: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('settingsMembers');
  const tc = useTranslations('common');
  const router = useRouter();
  const [role, setRole] = useState(member.role as 'manager' | 'buyer');
  const [access, setAccess] = useState(member.clientAccess);
  const [approve, setApprove] = useState(member.approveClientIds);
  const [transferPw, setTransferPw] = useState('');
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError && e.code === 'FORBIDDEN' ? t('wrongPassword') : tc('errorGeneric'));
      }
    });

  return (
    <Dialog
      open
      onOpenChange={(v) => (!v ? onClose() : undefined)}
      title={t('editTitle', { name: member.fullName ?? member.email })}
      closeLabel={tc('close')}
      footer={
        <>
          <Button
            kind="ghost"
            size="m"
            className="mr-auto text-danger"
            disabled={pending || isSelf}
            onClick={() => run(() => api(`members/${member.userId}`, { method: 'DELETE' }), t('removed'))}
          >
            {t('remove')}
          </Button>
          <Button kind="secondary" size="m" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            kind="primary"
            size="m"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  api(`members/${member.userId}`, {
                    method: 'PATCH',
                    body: {
                      role,
                      clientAccess: access,
                      ...(showApprove
                        ? {
                            approveClientIds: approve.filter(
                              (id) => role === 'buyer' && (access.length === 0 || access.includes(id)),
                            ),
                          }
                        : {}),
                    },
                  }),
                tc('saved'),
              )
            }
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('cols.role')} htmlFor="edit-role">
          <Select id="edit-role" value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'buyer')}>
            <option value="manager">{t('roles.manager')}</option>
            <option value="buyer">{t('roles.buyer')}</option>
          </Select>
        </Field>
        <ClientPicker
          clients={clients}
          value={access}
          onChange={setAccess}
          label={role === 'manager' ? t('clientsOptionalManager') : t('clientsForBuyer')}
        />
        {showApprove && role === 'buyer' ? (
          <ClientPicker
            clients={clients.filter((c) => access.includes(c.id))}
            value={approve}
            onChange={setApprove}
            label={t('approveFor')}
          />
        ) : null}
        {member.role === 'manager' ? (
          <div className="rounded-md border border-line px-3 py-3">
            <p className="text-body font-medium text-fg">{t('transferTitle')}</p>
            <p className="mt-1 text-small text-fg-secondary">{t('transferBody')}</p>
            <div className="mt-2 flex items-end gap-2">
              <Field label={t('yourPassword')} htmlFor="transfer-pw" className="flex-1">
                <Input
                  id="transfer-pw"
                  type="password"
                  value={transferPw}
                  onChange={(e) => setTransferPw(e.target.value)}
                />
              </Field>
              <Button
                kind="secondary"
                size="m"
                disabled={pending || !transferPw}
                onClick={() =>
                  run(
                    () =>
                      api(`members/${member.userId}/transfer-ownership`, {
                        method: 'POST',
                        body: { password: transferPw },
                      }),
                    t('transferred'),
                  )
                }
              >
                {t('transfer')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
