'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, CardHeader, Field, Input, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type G = {
  maxBudgetChangePct: string;
  maxActionsPerDay: number;
  minDataDays: number;
  quietStartHour: number;
  quietEndHour: number;
  breakerFailures: number;
  excludeMetaIds: string[];
};

/** P205: mỗi trường hiện giá trị cố định (mặc định) và cho siết chặt hơn; nới lỏng bị server từ chối. */
export function GuardrailsForm({ initial, defaults }: { initial: G; defaults: G }) {
  const t = useTranslations('guardrails');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bad, setBad] = useState<string[]>([]);
  const save = (fd: FormData) =>
    start(async () => {
      setBad([]);
      const body = {
        maxBudgetChangePct: String(fd.get('maxBudgetChangePct') ?? '').trim(),
        maxActionsPerDay: Number(fd.get('maxActionsPerDay')),
        minDataDays: Number(fd.get('minDataDays')),
        quietStartHour: Number(fd.get('quietStartHour')),
        quietEndHour: Number(fd.get('quietEndHour')),
        breakerFailures: Number(fd.get('breakerFailures')),
        excludeMetaIds: String(fd.get('excludeMetaIds') ?? '')
          .split(/[\s,]+/)
          .filter(Boolean),
      };
      try {
        await api('guardrails', { method: 'PUT', body });
        toast.success(tc('saved'));
        router.refresh();
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'GUARDRAIL_VIOLATION' || e.code === 'VALIDATION_FAILED')) {
          const fields =
            (e.details.fields as string[] | undefined) ??
            ((e.details.issues as { path: string }[] | undefined) ?? []).map((i) => i.path);
          setBad(fields);
          toast.error(t('looser'));
        } else toast.error(tc('errorGeneric'));
      }
    });
  const err = (k: string) => (bad.includes(k) ? t('looserField') : undefined);
  const hint = (k: keyof G) => t('fixed', { value: String(defaults[k]) });
  return (
    <Card>
      <CardHeader title={t('title')} />
      <form action={save} className="flex flex-col gap-3 px-4 py-4">
        <p className="text-body text-fg-secondary">{t('intro')}</p>
        <Field
          label={t('maxBudgetChangePct')}
          htmlFor="maxBudgetChangePct"
          hint={hint('maxBudgetChangePct')}
          error={err('maxBudgetChangePct')}
        >
          <Input
            id="maxBudgetChangePct"
            name="maxBudgetChangePct"
            defaultValue={initial.maxBudgetChangePct}
            inputMode="decimal"
          />
        </Field>
        <Field
          label={t('maxActionsPerDay')}
          htmlFor="maxActionsPerDay"
          hint={hint('maxActionsPerDay')}
          error={err('maxActionsPerDay')}
        >
          <Input
            id="maxActionsPerDay"
            name="maxActionsPerDay"
            type="number"
            min={1}
            max={defaults.maxActionsPerDay}
            defaultValue={initial.maxActionsPerDay}
          />
        </Field>
        <Field label={t('minDataDays')} htmlFor="minDataDays" hint={hint('minDataDays')} error={err('minDataDays')}>
          <Input
            id="minDataDays"
            name="minDataDays"
            type="number"
            min={defaults.minDataDays}
            max={30}
            defaultValue={initial.minDataDays}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('quietStartHour')}
            htmlFor="quietStartHour"
            hint={hint('quietStartHour')}
            error={err('quietStartHour')}
          >
            <Input
              id="quietStartHour"
              name="quietStartHour"
              type="number"
              min={12}
              max={defaults.quietStartHour}
              defaultValue={initial.quietStartHour}
            />
          </Field>
          <Field
            label={t('quietEndHour')}
            htmlFor="quietEndHour"
            hint={hint('quietEndHour')}
            error={err('quietEndHour')}
          >
            <Input
              id="quietEndHour"
              name="quietEndHour"
              type="number"
              min={defaults.quietEndHour}
              max={12}
              defaultValue={initial.quietEndHour}
            />
          </Field>
        </div>
        <Field
          label={t('breakerFailures')}
          htmlFor="breakerFailures"
          hint={hint('breakerFailures')}
          error={err('breakerFailures')}
        >
          <Input
            id="breakerFailures"
            name="breakerFailures"
            type="number"
            min={1}
            max={defaults.breakerFailures}
            defaultValue={initial.breakerFailures}
          />
        </Field>
        <Field
          label={t('excludeMetaIds')}
          htmlFor="excludeMetaIds"
          hint={t('excludeHint')}
          error={err('excludeMetaIds')}
        >
          <Textarea
            id="excludeMetaIds"
            name="excludeMetaIds"
            rows={3}
            defaultValue={initial.excludeMetaIds.join('\n')}
          />
        </Field>
        <div>
          <Button kind="primary" size="m" type="submit" disabled={pending}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
