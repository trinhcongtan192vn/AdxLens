'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

/** `as`: cách đưa giá trị nhập vào body — số nguyên, chuỗi (rỗng → null nếu `nullable`), ISO, danh sách theo dòng. */
type As = 'string' | 'int' | 'nullableString' | 'isoOrNull' | 'lines';
export type ActionField =
  | { name: string; label: string; kind: 'text' | 'number' | 'datetime'; initial?: string; as?: As }
  | { name: string; label: string; kind: 'textarea'; initial?: string; as?: As }
  | {
      name: string;
      label: string;
      kind: 'select';
      options: { value: string; label: string }[];
      initial?: string;
      as?: As;
    }
  | { name: string; label: string; kind: 'checkbox'; initial?: boolean };

function convert(f: ActionField, v: string | boolean): unknown {
  if (f.kind === 'checkbox') return Boolean(v);
  const s = String(v).trim();
  switch (f.as) {
    case 'int':
      return Number.parseInt(s, 10);
    case 'nullableString':
      return s === '' ? null : s;
    case 'isoOrNull':
      return s === '' ? null : new Date(s).toISOString();
    case 'lines':
      return s
        .split(/[\n,]/)
        .map((x) => x.trim())
        .filter(Boolean);
    default:
      return s;
  }
}

/**
 * Nút + hộp thoại cho thao tác ghi ở trang admin: các trường nhập, **lý do bắt buộc** (≥ 5 ký tự), gọi API rồi làm mới
 * trang. Body = `base` + từng trường (đổi kiểu theo `as`) + `reason`.
 */
export function AdminAction({
  label,
  title,
  path,
  method = 'POST',
  fields = [],
  base = {},
  done,
  kind = 'secondary',
  testId,
  intro,
  redirectTo,
}: {
  label: string;
  title: string;
  path: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  fields?: ActionField[];
  /** Trường cố định của body (vd. `{ action: 'comp' }`). */
  base?: Record<string, unknown>;
  done: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  testId?: string;
  /** Lời cảnh báo đầu hộp thoại (vd. thao tác không hoàn tác được). */
  intro?: string;
  /** Sau khi xong thì chuyển trang (vd. đối tượng vừa bị xóa) thay vì làm mới. */
  redirectTo?: string;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const init = () =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.kind === 'checkbox'
          ? (f.initial ?? false)
          : (f.initial ?? (f.kind === 'select' ? (f.options[0]?.value ?? '') : '')),
      ]),
    ) as Record<string, string | boolean>;
  const [values, setValues] = useState<Record<string, string | boolean>>(init);
  const [reason, setReason] = useState('');
  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));
  const submit = () =>
    start(async () => {
      try {
        const body = Object.fromEntries(fields.map((f) => [f.name, convert(f, values[f.name] ?? '')]));
        await api(path, { method, body: { ...base, ...body, reason } });
        toast.success(done);
        setOpen(false);
        setReason('');
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  const id = (n: string) => `${testId ?? 'act'}-${n}`;
  return (
    <>
      <Button
        kind={kind}
        size="s"
        data-testid={testId}
        onClick={() => {
          setValues(init());
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind={kind === 'danger' ? 'danger' : 'primary'}
              size="m"
              disabled={pending || reason.trim().length < 5}
              onClick={submit}
            >
              {label}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {intro ? <p className="text-body text-danger">{intro}</p> : null}
          {fields.map((f) =>
            f.kind === 'checkbox' ? (
              <label key={f.name} className="flex items-center gap-2 text-body">
                <Checkbox checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />
                {f.label}
              </label>
            ) : (
              <Field key={f.name} label={f.label} htmlFor={id(f.name)}>
                {f.kind === 'select' ? (
                  <Select id={id(f.name)} value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.kind === 'textarea' ? (
                  <Textarea
                    id={id(f.name)}
                    rows={3}
                    value={String(values[f.name])}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                ) : (
                  <Input
                    id={id(f.name)}
                    type={f.kind === 'number' ? 'number' : f.kind === 'datetime' ? 'datetime-local' : 'text'}
                    value={String(values[f.name])}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </Field>
            ),
          )}
          <Field label={t('reasonRequired')} htmlFor={id('reason')}>
            <Textarea id={id('reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
