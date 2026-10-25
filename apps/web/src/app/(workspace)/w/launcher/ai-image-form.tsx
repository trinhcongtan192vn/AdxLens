'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

/**
 * ADR-0027: mô tả ảnh → AI (OpenAI của workspace) tạo bản nháp; ảnh hiện trong danh sách khi xong. Không có khóa OpenAI
 * → hướng dẫn thêm khóa ở Cài đặt → Tích hợp.
 */
export function AiImageForm({
  adAccountId,
  hasOpenAiKey,
  canApprove,
  onQueued,
}: {
  adAccountId: string;
  hasOpenAiKey: boolean;
  canApprove: boolean;
  onQueued: () => void;
}) {
  const t = useTranslations('wsLauncher.creative.ai');
  const [prompt, setPrompt] = useState('');
  const [pending, start] = useTransition();
  if (!hasOpenAiKey) {
    return (
      <p className="mt-2 text-small text-fg-tertiary" data-testid="ai-image-no-key">
        {t('noKey')}{' '}
        <Link href="/settings/integrations" className="text-link underline">
          {t('addKey')}
        </Link>
      </p>
    );
  }
  const submit = () =>
    start(async () => {
      try {
        await api('creative-drafts/ai', { method: 'POST', body: { adAccountId, prompt } });
        toast.success(t('queued'));
        setPrompt('');
        onQueued();
      } catch (e) {
        const reason = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
        toast.error(reason === 'too_many' ? t('tooMany') : t('failed'));
      }
    });
  return (
    <div className="mt-3 rounded-md border border-line p-3" data-testid="ai-image-form">
      <label htmlFor="ai-prompt" className="flex items-center gap-1 text-small font-medium text-fg">
        <Sparkles className="size-4 text-brand" aria-hidden />
        {t('label')}
      </label>
      <Textarea
        id="ai-prompt"
        rows={2}
        maxLength={1000}
        value={prompt}
        placeholder={t('placeholder')}
        onChange={(e) => setPrompt(e.target.value)}
        className="mt-1"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          kind="secondary"
          size="s"
          disabled={!canApprove || pending || prompt.trim().length < 5}
          onClick={submit}
        >
          {t('generate')}
        </Button>
        <span className="text-caption text-fg-tertiary">{t('note')}</span>
      </div>
    </div>
  );
}
