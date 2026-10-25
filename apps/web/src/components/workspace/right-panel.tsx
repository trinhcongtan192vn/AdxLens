'use client';

import { Bell, Lightbulb, Loader2, MessageSquarePlus, PanelRightClose, Send, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, cn } from '@adxlens/ui';
import { PlanCard } from '@/app/(workspace)/w/agents/plan-card';
import { ActionDialog, type GridActionType } from '@/components/entity-actions';
import { Markdown } from '@/components/markdown';
import { api, ApiError } from '@/lib/api-client';
import {
  explainPresets,
  panelEntities,
  panelHidden,
  RP_ASK_EVENT,
  RP_COOKIE,
  type RpAskDetail,
  type RpTab,
} from '@/lib/right-panel';

type Proposal = {
  actionType: GridActionType;
  adAccountId: string;
  targetMetaId: string;
  targetName: string | null;
  newDailyBudget?: string | null;
  newName?: string | null;
  newValue?: string | null;
};
type Message = {
  id: string;
  role: 'user' | 'assistant';
  status: 'pending' | 'done' | 'error';
  content: string;
  proposals: Proposal[];
  plans?: string[];
  source: 'llm' | 'facts' | 'unconfigured' | 'stopped' | null;
  facts: { label: string; text: string }[];
};
type Note = { id: string; title: string; body: string; link: string | null; read: boolean };

const saveOpen = (open: boolean) => {
  document.cookie = `${RP_COOKIE}=${open ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax`;
};

/**
 * Right panel (PM 25/10, khối thứ 3 của bố cục): trợ lý theo ngữ cảnh màn đang xem.
 * - Hỏi AI: câu hỏi kèm tài khoản / kỳ / đối tượng đang xem; câu trả lời qua cùng bộ kiểm số, thẻ đề xuất / kế hoạch duyệt
 *   ngay trong panel (không phải sang màn AI Agents).
 * - Giải thích: câu hỏi gợi ý theo màn; nút ✨ cạnh KPI gửi thẳng vào đây.
 * - Thông báo: xem nhanh hộp thư.
 * Mặc định gập; trạng thái mở nhớ theo người dùng (cookie). Màn nhỏ: bottom sheet.
 */
export function RightPanel({
  aiEnabled,
  initialOpen,
  accountId,
  period,
}: {
  aiEnabled: boolean;
  initialOpen: boolean;
  accountId: string | null;
  period: string;
}) {
  const t = useTranslations('panel');
  const pathname = usePathname() ?? '/w';
  const [open, setOpen] = useState(initialOpen);
  const [tab, setTab] = useState<RpTab>(aiEnabled ? 'ask' : 'inbox');
  const chat = useRef<{ send: (q: string) => void } | null>(null);

  const show = useCallback((next: boolean, nextTab?: RpTab) => {
    setOpen(next);
    if (nextTab) setTab(nextTab);
    saveOpen(next);
  }, []);
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<RpAskDetail>).detail?.question;
      if (!q || !aiEnabled) return;
      show(true, 'ask');
      // Đợi panel mở rồi gửi.
      setTimeout(() => chat.current?.send(q), 0);
    };
    window.addEventListener(RP_ASK_EVENT, onAsk);
    return () => window.removeEventListener(RP_ASK_EVENT, onAsk);
  }, [aiEnabled, show]);

  if (panelHidden(pathname)) return null;
  const tabs: { key: RpTab; icon: typeof Sparkles }[] = [
    ...(aiEnabled
      ? [
          { key: 'ask' as const, icon: Sparkles },
          { key: 'explain' as const, icon: Lightbulb },
        ]
      : []),
    { key: 'inbox', icon: Bell },
  ];

  if (!open) {
    return (
      <>
        {/* Màn rộng: thanh dọc mảnh ở mép phải. */}
        <nav
          className="sticky top-0 hidden h-screen w-12 shrink-0 flex-col items-center gap-2 border-l border-line bg-surface py-4 lg:flex print:hidden"
          aria-label={t('title')}
          data-testid="right-rail"
        >
          {tabs.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => show(true, key)}
              aria-label={t(`tabs.${key}`)}
              title={t(`tabs.${key}`)}
              className="flex size-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg"
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </nav>
        {/* Màn nhỏ: nút nổi mở bottom sheet. */}
        <button
          type="button"
          onClick={() => show(true)}
          aria-label={t('title')}
          className="fixed bottom-4 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg lg:hidden print:hidden"
        >
          <Sparkles className="size-5" aria-hidden />
        </button>
      </>
    );
  }

  return (
    <aside
      className={cn(
        'z-40 flex flex-col border-line bg-surface print:hidden',
        // Màn nhỏ: bottom sheet; màn rộng: cột phải.
        'fixed inset-x-0 bottom-0 h-[75vh] rounded-t-2xl border-t shadow-2xl',
        'lg:sticky lg:top-0 lg:h-screen lg:w-[380px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none',
      )}
      aria-label={t('title')}
      data-testid="right-panel"
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {tabs.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-small',
              tab === key ? 'bg-brand-subtle font-semibold text-brand' : 'text-fg-secondary hover:bg-hover',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(`tabs.${key}`)}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => show(false)}
          aria-label={t('close')}
          className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary hover:bg-hover hover:text-fg"
        >
          <PanelRightClose className="hidden size-4 lg:block" aria-hidden />
          <X className="size-4 lg:hidden" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {aiEnabled ? (
          <div className={cn('h-full', tab !== 'ask' && 'hidden')}>
            <PanelChat ref={chat} accountId={accountId} period={period} pathname={pathname} />
          </div>
        ) : null}
        {tab === 'explain' ? (
          <ExplainTab
            pathname={pathname}
            onAsk={(q) => {
              setTab('ask');
              setTimeout(() => chat.current?.send(q), 0);
            }}
          />
        ) : null}
        {tab === 'inbox' ? <InboxTab /> : null}
      </div>
    </aside>
  );
}

function ExplainTab({ pathname, onAsk }: { pathname: string; onAsk: (q: string) => void }) {
  const t = useTranslations('panel.explain');
  return (
    <div className="space-y-2 overflow-y-auto p-3" data-testid="panel-explain">
      <p className="text-small text-fg-secondary">{t('intro')}</p>
      {explainPresets(pathname).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onAsk(t(`q.${k}`))}
          className="flex w-full items-start gap-2 rounded-lg border border-line p-2.5 text-left text-small text-fg hover:bg-hover"
        >
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          {t(`q.${k}`)}
        </button>
      ))}
      <p className="text-caption text-fg-tertiary">{t('note')}</p>
    </div>
  );
}

function InboxTab() {
  const t = useTranslations('panel.inbox');
  const router = useRouter();
  const [items, setItems] = useState<Note[] | null>(null);
  useEffect(() => {
    api<{ items: Note[] }>('notifications')
      .then((r) => setItems(r.items.slice(0, 15)))
      .catch(() => setItems([]));
  }, []);
  const open = async (n: Note) => {
    if (!n.read) await api(`notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    if (n.link) router.push(n.link);
    setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
  };
  return (
    <div className="flex h-full flex-col" data-testid="panel-inbox">
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {items === null ? (
          <li className="p-3 text-small text-fg-tertiary">…</li>
        ) : items.length === 0 ? (
          <li className="p-3 text-small text-fg-tertiary">{t('empty')}</li>
        ) : (
          items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => void open(n)} className="w-full px-3 py-2 text-left hover:bg-hover">
                <span className={cn('block text-small', n.read ? 'text-fg-secondary' : 'font-medium text-fg')}>
                  {n.title}
                </span>
                <span className="block text-caption text-fg-tertiary">{n.body}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      <Link href="/w/alerts" className="border-t border-line p-3 text-small text-link hover:underline">
        {t('all')}
      </Link>
    </div>
  );
}

function PanelChat({
  ref,
  accountId,
  period,
  pathname,
}: {
  ref: React.Ref<{ send: (q: string) => void }>;
  accountId: string | null;
  period: string;
  pathname: string;
}) {
  const t = useTranslations('panel.ask');
  const ta = useTranslations('wsAgents');
  const locale = useLocale();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Proposal | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const entities = useMemo(() => panelEntities(pathname), [pathname]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      setBusy(true);
      setQ('');
      try {
        const r = await api<{ threadId: string }>('agent/ask', {
          method: 'POST',
          body: {
            threadId,
            question: text,
            adAccountId: accountId,
            ...(['last7', 'last14', 'last30'].includes(period) ? { period } : {}),
            locale: locale === 'en' ? 'en' : 'vi',
            ...(entities.length ? { entities } : {}),
          },
        });
        setThreadId(r.threadId);
        for (let i = 0; i < 90; i++) {
          const th = await api<{ messages: Message[] }>(`agent/threads/${r.threadId}`);
          setMessages(th.messages);
          if (!th.messages.some((m) => m.status === 'pending')) break;
          await new Promise((res) => setTimeout(res, 1500));
        }
      } catch (e) {
        toast.error(e instanceof ApiError && e.code === 'RATE_LIMITED' ? ta('limit') : ta('error'));
      }
      setBusy(false);
    },
    [busy, threadId, accountId, period, locale, entities, ta],
  );
  // Cho panel (nút ✨, tab Giải thích) gửi câu hỏi vào đây.
  useImperativeHandle(ref, () => ({ send: (x: string) => void send(x) }), [send]);

  return (
    <div className="flex h-full flex-col" data-testid="panel-ask">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-small text-fg-secondary">{entities.length ? t('introEntity') : t('intro')}</p>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <p key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-small text-on-brand">
                {m.content}
              </p>
            ) : (
              <div
                key={m.id}
                className="mr-4 rounded-2xl rounded-bl-sm bg-subtle px-3 py-2 text-small text-fg"
                data-testid="panel-answer"
              >
                {m.status === 'pending' ? (
                  <span className="flex items-center gap-2 text-fg-secondary">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {ta('thinking')}
                  </span>
                ) : m.source === 'unconfigured' ? (
                  <span className="text-fg-secondary">{ta('unconfigured')}</span>
                ) : m.source === 'facts' ? (
                  <>
                    <p className="text-fg-secondary">{ta('factsIntro')}</p>
                    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-caption">
                      {m.facts.slice(0, 12).map((f, i) => (
                        <div key={i} className="contents">
                          <dt className="truncate font-mono text-fg-tertiary">{f.label}</dt>
                          <dd className="num text-right">{f.text}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <Markdown text={m.content} />
                )}
                {(m.plans ?? []).map((id) => (
                  <PlanCard key={id} planId={id} />
                ))}
                {m.proposals.map((p, i) => (
                  <div key={i} className="mt-2 rounded-lg border border-brand bg-surface p-2">
                    <p className="text-small">
                      {ta(`actions.${p.actionType}`, { name: p.targetName ?? p.targetMetaId })}
                    </p>
                    <Button kind="primary" size="s" className="mt-1" onClick={() => setDialog(p)}>
                      {ta('review')}
                    </Button>
                  </div>
                ))}
              </div>
            ),
          )
        )}
        <div ref={bottom} />
      </div>
      <form
        className="border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
      >
        <div className="flex items-center gap-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            disabled={busy}
            data-testid="panel-input"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-control bg-surface px-3 text-small text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-none"
          />
          <Button kind="primary" size="m" type="submit" disabled={busy || !q.trim()} aria-label={ta('send')}>
            <Send className="size-4" aria-hidden />
          </Button>
          <Button
            kind="ghost"
            size="m"
            type="button"
            disabled={busy}
            onClick={() => {
              setThreadId(null);
              setMessages([]);
            }}
            aria-label={t('newChat')}
            title={t('newChat')}
          >
            <MessageSquarePlus className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-1 text-caption text-fg-tertiary">
          {entities.length ? t('contextEntity') : accountId ? t('contextAccount') : t('contextAll')}
        </p>
      </form>
      {dialog ? (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          type={dialog.actionType}
          targets={[
            {
              adAccountId: dialog.adAccountId,
              metaId: dialog.targetMetaId,
              name: dialog.newName ?? dialog.targetName ?? dialog.targetMetaId,
              dailyBudget: dialog.newDailyBudget ?? null,
              bidAmount: dialog.actionType === 'set_adset_bid' ? (dialog.newValue ?? null) : null,
              spendCap: dialog.actionType === 'set_campaign_spend_cap' ? (dialog.newValue ?? null) : null,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
