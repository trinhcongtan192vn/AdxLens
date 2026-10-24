'use client';

import { ExternalLink } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, buttonVariants, Drawer, Field, Skeleton, Textarea } from '@adxlens/ui';
import { api } from '@/lib/api-client';

export type FindingDto = {
  id: string;
  rule_id: string;
  group: string;
  entity: { type: string; meta_id: string; name: string | null };
  severity: 'low' | 'medium' | 'high';
  impact_estimate: { amount: string; currency: string | null; method: string | null } | null;
  evidence: Record<string, unknown>;
  explanation: { why: string; what_to_do: string; deep_link: string | null };
  status: string;
};

export const SEVERITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;

function EvidenceTable({ evidence }: { evidence: Record<string, unknown> }) {
  const t = useTranslations('findings');
  const format = useFormatter();
  const metrics = (evidence.metrics ?? {}) as Record<string, unknown>;
  const fmt = (v: unknown) =>
    typeof v === 'number'
      ? format.number(v, { maximumFractionDigits: 4 })
      : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)
        ? format.number(Number(v), { maximumFractionDigits: 2 })
        : Array.isArray(v)
          ? `${v.length} ${t('cols.finding').toLowerCase()}`
          : String(v ?? '—');
  const label = (k: string) => (t.has(`metric.${k}`) ? t(`metric.${k}`) : k);
  const rows = Object.entries(metrics).filter(([k]) => !k.endsWith('_ids'));
  if (!rows.length) return null;
  return (
    <table className="w-full text-small">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-line last:border-0">
            <td className="py-1 pr-2 text-fg-secondary">{label(k)}</td>
            <td className="num py-1 text-right text-fg">
              {Array.isArray(v) && v.length === 2 ? `${fmt(v[0])} → ${fmt(v[1])}` : fmt(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** D03: drawer chi tiết phát hiện, mở bằng `?finding=<id>` để giữ ngữ cảnh bảng (ux-requirements 7). */
export function FindingDrawer() {
  const t = useTranslations('findings');
  const tr = useTranslations('rules');
  const ta = useTranslations('account');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = params.get('finding');
  const [data, setData] = useState<FindingDto | null>(null);
  const [mode, setMode] = useState<'dismiss' | 'wrong' | null>(null);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    setData(null);
    setMode(null);
    setNote('');
    if (!id) return;
    let alive = true;
    api<FindingDto>(`findings/${id}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && toast.error(tc('errorGeneric')));
    return () => {
      alive = false;
    };
  }, [id, tc]);

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete('finding');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const send = (kind: 'seen' | 'done' | 'dismissed' | 'wrong') =>
    start(async () => {
      try {
        await api(`findings/${id}/feedback`, { method: 'POST', body: { kind, note: note || undefined } });
        toast.success(t('drawer.saved'));
        close();
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  const ev = data?.evidence as { window?: { current: string[]; baseline: string[] } } | undefined;
  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && close()}
      title={data ? (tr.has(`${data.rule_id}.name`) ? tr(`${data.rule_id}.name`) : data.rule_id) : t('title')}
      closeLabel={tc('close')}
      footer={
        data ? (
          mode ? (
            <>
              <Button kind="secondary" size="m" onClick={() => setMode(null)}>
                {tc('cancel')}
              </Button>
              <Button
                kind="primary"
                size="m"
                disabled={pending || (mode === 'dismiss' && !note.trim())}
                onClick={() => send(mode === 'dismiss' ? 'dismissed' : 'wrong')}
              >
                {tc('confirm')}
              </Button>
            </>
          ) : (
            <>
              <Button kind="ghost" size="m" disabled={pending} onClick={() => setMode('wrong')}>
                {t('drawer.wrong')}
              </Button>
              <Button kind="secondary" size="m" disabled={pending} onClick={() => setMode('dismiss')}>
                {t('drawer.dismiss')}
              </Button>
              {data.status === 'new' ? (
                <Button kind="secondary" size="m" disabled={pending} onClick={() => send('seen')}>
                  {t('drawer.seen')}
                </Button>
              ) : null}
              <Button kind="primary" size="m" disabled={pending} onClick={() => send('done')}>
                {t('drawer.done')}
              </Button>
            </>
          )
        ) : null
      }
    >
      {!data ? (
        <div className="space-y-2" aria-label={tc('loading')}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-4 text-body">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[data.severity]}>{t(`severity.${data.severity}`)}</Badge>
            <Badge tone="neutral">{t(`status.${data.status}` as never)}</Badge>
            <span className="text-fg-secondary">
              {t(`entity.${data.entity.type}` as never)}:{' '}
              <span className="text-fg">{data.entity.name ?? data.entity.meta_id}</span>
            </span>
          </div>
          <section>
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('drawer.why')}</h3>
            <p className="mt-1 text-fg">{data.explanation.why}</p>
          </section>
          <section>
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('drawer.whatToDo')}</h3>
            <p className="mt-1 text-fg">{data.explanation.what_to_do}</p>
          </section>
          <section>
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('drawer.impact')}</h3>
            {data.impact_estimate ? (
              <>
                <p className="num mt-1 text-h3 font-semibold text-fg">
                  {format.number(Number(data.impact_estimate.amount), {
                    maximumFractionDigits: data.impact_estimate.currency === 'VND' ? 0 : 2,
                  })}{' '}
                  {data.impact_estimate.currency}
                </p>
                {data.impact_estimate.method ? (
                  <p className="text-small text-fg-secondary">
                    {t('drawer.method', { method: data.impact_estimate.method })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-fg-secondary">{t('drawer.noImpact')}</p>
            )}
          </section>
          <section>
            <h3 className="text-small font-semibold uppercase text-fg-tertiary">{t('drawer.evidence')}</h3>
            {ev?.window ? (
              <p className="mt-1 text-small text-fg-secondary">
                {t('drawer.window', { cur: ev.window.current.join(' → '), prev: ev.window.baseline.join(' → ') })}
              </p>
            ) : null}
            <div className="mt-1">
              <EvidenceTable evidence={data.evidence} />
            </div>
          </section>
          {data.explanation.deep_link ? (
            <a
              href={data.explanation.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ kind: 'secondary', size: 'm' })}
            >
              <ExternalLink className="size-4" /> {ta('openAdsManager')}
            </a>
          ) : null}
          <p className="text-caption text-fg-tertiary">{t('drawer.notLlm')}</p>
          {mode ? (
            <Field label={mode === 'dismiss' ? t('drawer.reason') : t('drawer.wrongNote')} htmlFor="finding-note">
              <Textarea
                id="finding-note"
                value={note}
                maxLength={500}
                placeholder={mode === 'dismiss' ? t('drawer.reasonPlaceholder') : undefined}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
