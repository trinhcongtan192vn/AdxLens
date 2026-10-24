'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants, Checkbox, Dialog, Drawer, Field, Input, Textarea } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Edits = { title?: string; intro?: string; workDone?: string; nextSteps?: string; hiddenSections?: string[] };
const SECTIONS = ['kpis', 'trend', 'campaigns', 'audience', 'creatives', 'findings', 'workDone', 'nextSteps'] as const;

/** Làm mới trang khi báo cáo đang dựng (L). */
export function ReportPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

/** R03: chia sẻ (R04), chỉnh nội dung agency, dựng lại, xóa. */
export function ReportToolbar({ id, edits, ready }: { id: string; edits: Edits; ready: boolean; blocked: boolean }) {
  const t = useTranslations('reports.view');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<Edits>(edits);
  const hidden = new Set(form.hiddenSections ?? []);

  const run = (fn: () => Promise<unknown>, done?: () => void) =>
    start(async () => {
      try {
        await fn();
        done?.();
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  return (
    <>
      {ready ? (
        <Button kind="secondary" size="m" onClick={() => setEditing(true)}>
          {t('edit')}
        </Button>
      ) : null}
      {ready ? (
        <Link href={`/reports/${id}/share`} className={buttonVariants({ kind: 'primary', size: 'm' })}>
          {t('share')}
        </Link>
      ) : null}
      <Button
        kind="secondary"
        size="m"
        disabled={pending}
        onClick={() => run(() => api(`reports/${id}/rebuild`, { method: 'POST' }))}
      >
        {t('rebuild')}
      </Button>
      <Button kind="ghost" size="m" onClick={() => setConfirmDelete(true)}>
        {t('delete')}
      </Button>

      <Drawer
        open={editing}
        onOpenChange={setEditing}
        title={t('edit')}
        closeLabel={tc('close')}
        footer={
          <Button
            kind="primary"
            size="m"
            disabled={pending}
            onClick={() =>
              run(
                () => api(`reports/${id}`, { method: 'PATCH', body: form }),
                () => {
                  setEditing(false);
                  toast.success(t('saved'));
                },
              )
            }
          >
            {t('save')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('titleLabel')} htmlFor="r-title">
            <Input
              id="r-title"
              maxLength={160}
              value={form.title ?? ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label={t('intro')} htmlFor="r-intro">
            <Textarea
              id="r-intro"
              rows={4}
              maxLength={2000}
              value={form.intro ?? ''}
              onChange={(e) => setForm({ ...form, intro: e.target.value })}
            />
          </Field>
          <Field label={t('workDone')} htmlFor="r-done">
            <Textarea
              id="r-done"
              rows={5}
              maxLength={4000}
              value={form.workDone ?? ''}
              onChange={(e) => setForm({ ...form, workDone: e.target.value })}
            />
          </Field>
          <Field label={t('nextSteps')} htmlFor="r-next">
            <Textarea
              id="r-next"
              rows={5}
              maxLength={4000}
              value={form.nextSteps ?? ''}
              onChange={(e) => setForm({ ...form, nextSteps: e.target.value })}
            />
          </Field>
          <fieldset>
            <legend className="text-small font-medium text-fg-secondary">{t('hide')}</legend>
            {SECTIONS.map((s) => (
              <label key={s} className="mt-1 flex items-center gap-2 text-body">
                <Checkbox
                  checked={hidden.has(s)}
                  onChange={(e) => {
                    const next = new Set(hidden);
                    if (e.target.checked) next.add(s);
                    else next.delete(s);
                    setForm({ ...form, hiddenSections: [...next] });
                  }}
                />
                {t(`sections.${s}`)}
              </label>
            ))}
          </fieldset>
        </div>
      </Drawer>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('delete')}
        description={t('deleteConfirm')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setConfirmDelete(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="danger"
              size="m"
              disabled={pending}
              onClick={() =>
                run(
                  () => api(`reports/${id}`, { method: 'DELETE' }),
                  () => router.push('/reports'),
                )
              }
            >
              {t('delete')}
            </Button>
          </>
        }
      />
    </>
  );
}
