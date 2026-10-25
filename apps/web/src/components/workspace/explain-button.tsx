'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RP_ASK_EVENT, type RpAskDetail } from '@/lib/right-panel';

/** Nút ✨ cạnh KPI / biểu đồ: mở right panel và hỏi "vì sao {chỉ số} thay đổi" (số do công cụ tính, AI diễn giải). */
export function ExplainButton({ label }: { label: string }) {
  const t = useTranslations('panel.explain');
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent<RpAskDetail>(RP_ASK_EVENT, { detail: { question: t('metric', { metric: label }) } }),
        )
      }
      aria-label={t('button', { metric: label })}
      title={t('button', { metric: label })}
      className="rounded p-0.5 text-fg-tertiary hover:bg-hover hover:text-brand print:hidden"
      data-testid="explain-button"
    >
      <Sparkles className="size-3.5" aria-hidden />
    </button>
  );
}
