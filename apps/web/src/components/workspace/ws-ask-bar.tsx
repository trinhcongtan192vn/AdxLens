'use client';

import { Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Ô hỏi nổi trên mọi trang Workspace (Madgicx "Why did my cost…"); mở trang Agents với câu hỏi. */
export function WsAskBar() {
  const t = useTranslations('wsAgents');
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  if (pathname?.startsWith('/w/agents')) return null;
  return (
    <form
      className="fixed bottom-4 left-1/2 z-30 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 lg:left-[calc(50%+120px)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/w/agents?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 shadow-lg">
        <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('floating')}
          aria-label={t('floating')}
          data-testid="ws-ask-bar"
          className="h-full flex-1 bg-transparent text-body text-fg placeholder:text-fg-tertiary focus:outline-none"
        />
      </label>
    </form>
  );
}
