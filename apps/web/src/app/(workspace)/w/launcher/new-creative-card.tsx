'use client';

import { ImagePlus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, cn, Field, Input, Select, Textarea } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Draft = {
  id: string;
  source: 'upload' | 'ai';
  status: 'generating' | 'ready' | 'failed';
  prompt: string | null;
  url: string | null;
};
const CTAS = [
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'CONTACT_US',
  'ORDER_NOW',
  'GET_OFFER',
  'BOOK_TRAVEL',
  'SUBSCRIBE',
  'APPLY_NOW',
  'DOWNLOAD',
  'MESSAGE_PAGE',
] as const;

/**
 * ADR-0027: creative ảnh đơn mới — tải ảnh lên (PNG / JPEG / WebP ≤ 5MB) thành bản nháp, chọn Page, link https, nội
 * dung, tiêu đề, nút CTA → tạo creative qua Execution Gateway (duyệt tay). Quảng cáo từ creative tạo ở Ad Launcher.
 */
export function NewCreativeCard({
  adAccountId,
  canApprove,
  pages,
  namePrefix,
  children,
}: {
  adAccountId: string;
  canApprove: boolean;
  pages: { metaId: string; name: string }[];
  namePrefix: string | null;
  /** Khối AI tạo ảnh (bước sau) chèn vào đây. */
  children?: React.ReactNode;
}) {
  const t = useTranslations('wsLauncher.creative');
  const tl = useTranslations('wsLauncher');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState('');
  const [pageId, setPageId] = useState(pages[0]?.metaId ?? '');
  const [link, setLink] = useState('https://');
  const [message, setMessage] = useState('');
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState<(typeof CTAS)[number]>('LEARN_MORE');
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Draft[] }>(`creative-drafts?ad_account_id=${adAccountId}`);
      setDrafts(r.items);
      setDraftId((cur) => cur || r.items.find((d) => d.status === 'ready')?.id || '');
    } catch {
      setDrafts([]);
    }
  }, [adAccountId]);
  useEffect(() => {
    void load();
  }, [load]);
  // Ảnh AI đang tạo → hỏi lại mỗi 5 giây.
  useEffect(() => {
    if (!drafts.some((d) => d.status === 'generating')) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [drafts, load]);

  const uploadFile = async (f: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', f);
      form.set('ad_account_id', adAccountId);
      const res = await fetch('/api/v1/creative-drafts', { method: 'POST', body: form });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      setDraftId(id);
      await load();
    } catch {
      toast.error(t('uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const validLink = /^https:\/\/[^\s]+\.[^\s]+/.test(link);
  const autoName = [namePrefix, headline.trim() || t('defaultName')].filter(Boolean).join(' · ');
  const submit = () =>
    start(async () => {
      try {
        await api('launcher/creatives', {
          method: 'POST',
          body: {
            adAccountId,
            draftId,
            pageId,
            link,
            message,
            headline,
            cta,
            name: (name.trim() || autoName).slice(0, 150),
          },
        });
        setDone(true);
        toast.success(t('queued'));
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'INTERNAL';
        toast.error(tl.has(`errors.${code}`) ? tl(`errors.${code}` as never) : tl('errors.other'));
      }
    });

  return (
    <Card data-testid="new-creative-launcher">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <ImagePlus className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 text-small text-fg-secondary">{t('intro')}</p>
      {!pages.length ? (
        <Banner tone="warning" className="mt-3">
          {t('noPage')}
        </Banner>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          data-testid="creative-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <Button kind="secondary" size="m" disabled={uploading || !canApprove} onClick={() => fileRef.current?.click()}>
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="size-4" aria-hidden />
          )}
          {t('upload')}
        </Button>
        <span className="text-caption text-fg-tertiary">{t('uploadHint')}</span>
      </div>
      {children}

      {drafts.length ? (
        <ul
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6"
          aria-label={t('drafts')}
          data-testid="creative-drafts"
        >
          {drafts.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                disabled={d.status !== 'ready'}
                onClick={() => setDraftId(d.id)}
                aria-pressed={draftId === d.id}
                className={cn(
                  'flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-subtle text-caption text-fg-tertiary',
                  draftId === d.id ? 'border-brand ring-2 ring-brand' : 'border-line',
                )}
                title={d.prompt ?? undefined}
              >
                {d.status === 'ready' && d.url ? (
                  <img src={d.url} alt="" className="size-full object-cover" />
                ) : d.status === 'generating' ? (
                  <Loader2 className="size-4 animate-spin" aria-label={t('generating')} />
                ) : (
                  t('failed')
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t('page')} htmlFor="nc-page">
          <Select id="nc-page" value={pageId} onChange={(e) => setPageId(e.target.value)}>
            {pages.map((p) => (
              <option key={p.metaId} value={p.metaId}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('link')} htmlFor="nc-link">
          <Input id="nc-link" value={link} maxLength={1000} onChange={(e) => setLink(e.target.value.trim())} />
        </Field>
        <Field label={t('headline')} htmlFor="nc-headline">
          <Input id="nc-headline" value={headline} maxLength={255} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <Field label={t('cta')} htmlFor="nc-cta">
          <Select id="nc-cta" value={cta} onChange={(e) => setCta(e.target.value as (typeof CTAS)[number])}>
            {CTAS.map((c) => (
              <option key={c} value={c}>
                {t(`ctas.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('message')} htmlFor="nc-message" className="mt-3">
        <Textarea
          id="nc-message"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <Field label={t('name')} htmlFor="nc-name" className="mt-3">
        <Input
          id="nc-name"
          value={name}
          placeholder={autoName}
          maxLength={150}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <Button
          kind="primary"
          size="m"
          disabled={!canApprove || pending || !draftId || !pageId || !validLink || !message.trim() || !headline.trim()}
          onClick={submit}
          data-testid="launch-creative"
        >
          {t('launch')}
        </Button>
        <span className="text-caption text-fg-tertiary">{t('note')}</span>
      </div>
      {done ? (
        <Banner tone="success" className="mt-3">
          {t('queued')}{' '}
          <a href="/action-log" className="font-medium underline">
            {tl('openLog')}
          </a>
        </Banner>
      ) : null}
    </Card>
  );
}
