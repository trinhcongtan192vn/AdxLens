'use client';

import { Bot, Loader2, MessageSquarePlus, Send, Sparkles, Star, Trash2, Wrench } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, cn, Select } from '@adxlens/ui';
import { ActionDialog, type GridActionType } from '@/components/entity-actions';
import { api, ApiError } from '@/lib/api-client';

type Thread = { id: string; title: string; favorite: boolean; updated_at: string };
type Proposal = {
  actionType: GridActionType;
  adAccountId: string;
  targetMetaId: string;
  targetName: string | null;
  newDailyBudget?: string | null;
  reason?: string;
};
type Message = {
  id: string;
  role: 'user' | 'assistant';
  status: 'pending' | 'done' | 'error';
  content: string;
  tools: { name: string }[];
  proposals: Proposal[];
  source: 'llm' | 'facts' | 'unconfigured' | null;
  facts: { label: string; text: string }[];
};

/** Trang AI Agents (ADR-0019, bố cục Madgicx Agents): lịch sử + yêu thích, câu mẫu, chat, đề xuất chờ duyệt. */
export function AgentChat({
  accounts,
  defaultAccountId,
  canPropose,
}: {
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  canPropose: boolean;
}) {
  const t = useTranslations('wsAgents');
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [q, setQ] = useState('');
  const [account, setAccount] = useState(defaultAccountId ?? '');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Proposal | null>(null);
  const asked = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const r = await api<{ items: Thread[] }>('agent/threads');
    setThreads(r.items);
  }, []);
  const loadThread = useCallback(async (id: string) => {
    const r = await api<{ messages: Message[] }>(`agent/threads/${id}`);
    setMessages(r.messages);
    return r.messages;
  }, []);

  useEffect(() => {
    loadThreads().catch(() => undefined);
  }, [loadThreads]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const poll = useCallback(
    async (id: string) => {
      for (let i = 0; i < 90; i++) {
        const ms = await loadThread(id);
        if (!ms.some((m) => m.status === 'pending')) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      setBusy(false);
      loadThreads().catch(() => undefined);
    },
    [loadThread, loadThreads],
  );

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
            threadId: active,
            question: text,
            adAccountId: account || null,
            locale: locale === 'en' ? 'en' : 'vi',
          },
        });
        setActive(r.threadId);
        await poll(r.threadId);
      } catch (e) {
        setBusy(false);
        toast.error(e instanceof ApiError && e.code === 'RATE_LIMITED' ? t('limit') : t('error'));
      }
    },
    [active, account, busy, poll, t, locale],
  );

  // Câu hỏi từ ô hỏi nổi / trang chủ (?q=…): hỏi một lần.
  useEffect(() => {
    const initial = sp?.get('q');
    if (initial && !asked.current) {
      asked.current = true;
      void send(initial);
      router.replace('/w/agents');
    }
  }, [sp, send, router]);

  const open = async (id: string) => {
    setActive(id);
    await loadThread(id);
  };

  const samples = {
    ask: ['askSpend', 'askCpa', 'askBest', 'askFatigue', 'askFindings', 'askRegion'],
    do: ['doPause', 'doBudget', 'doRefresh'],
  } as const;

  return (
    <div className="grid h-[calc(100vh-140px)] gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <Button
            kind="secondary"
            size="m"
            className="w-full"
            onClick={() => {
              setActive(null);
              setMessages([]);
            }}
          >
            <MessageSquarePlus className="size-4" aria-hidden />
            {t('newChat')}
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2" aria-label={t('history')}>
          {threads.length === 0 ? <li className="px-2 py-1 text-caption text-fg-tertiary">{t('noHistory')}</li> : null}
          {threads.map((th) => (
            <li key={th.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => open(th.id)}
                className={cn(
                  'flex-1 truncate rounded-md px-2 py-1.5 text-left text-small',
                  active === th.id ? 'bg-brand-subtle text-brand' : 'text-fg-secondary hover:bg-hover',
                )}
              >
                {th.title}
              </button>
              <button
                type="button"
                aria-label={th.favorite ? t('unfavorite') : t('favorite')}
                onClick={async () => {
                  await api(`agent/threads/${th.id}`, { method: 'PATCH', body: { favorite: !th.favorite } });
                  await loadThreads();
                }}
                className={cn(
                  'rounded p-1',
                  th.favorite ? 'text-warning' : 'text-fg-tertiary opacity-0 group-hover:opacity-100',
                )}
              >
                <Star className="size-3.5" fill={th.favorite ? 'currentColor' : 'none'} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t('delete')}
                onClick={async () => {
                  await api(`agent/threads/${th.id}`, { method: 'DELETE' });
                  if (active === th.id) {
                    setActive(null);
                    setMessages([]);
                  }
                  await loadThreads();
                }}
                className="rounded p-1 text-fg-tertiary opacity-0 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-4" data-testid="agent-messages">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-subtle text-brand">
                <Bot className="size-6" aria-hidden />
              </span>
              <h2 className="mt-3 text-h3 font-semibold text-fg">{t('welcome')}</h2>
              <p className="mt-1 text-small text-fg-secondary">{t('welcomeBody')}</p>
              <div className="mt-6 grid gap-4 text-left sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-tertiary">
                    {t('askAbout')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {samples.ask.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => send(t(`samples.${k}`))}
                        className="rounded-lg border border-line px-3 py-2 text-left text-small text-fg hover:bg-hover"
                      >
                        {t(`samples.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-tertiary">
                    {t('getDone')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {samples.do.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => send(t(`samples.${k}`))}
                        className="rounded-lg border border-line px-3 py-2 text-left text-small text-fg hover:bg-hover"
                      >
                        {t(`samples.${k}`)}
                      </button>
                    ))}
                  </div>
                  {!canPropose ? <p className="mt-2 text-caption text-fg-tertiary">{t('proposeOff')}</p> : null}
                </div>
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((m) => (
                <li key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {m.role === 'user' ? (
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-small text-on-brand">
                      {m.content}
                    </div>
                  ) : (
                    <div
                      className="max-w-[90%] rounded-2xl rounded-bl-sm bg-subtle px-3 py-2 text-small text-fg"
                      data-testid="agent-answer"
                    >
                      {m.status === 'pending' ? (
                        <span className="flex items-center gap-2 text-fg-secondary">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          {t('thinking')}
                        </span>
                      ) : m.source === 'unconfigured' ? (
                        <span className="text-fg-secondary">
                          {m.status === 'error' ? t('disabled') : t('unconfigured')}
                        </span>
                      ) : m.source === 'facts' ? (
                        <>
                          <p className="text-fg-secondary">{t('factsIntro')}</p>
                          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 text-caption">
                            {m.facts.map((f, i) => (
                              <div key={i} className="contents">
                                <dt className="truncate font-mono text-fg-tertiary">{f.label}</dt>
                                <dd className="num text-right text-fg">{f.text}</dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                      {m.tools.length ? (
                        <p className="mt-2 flex flex-wrap items-center gap-1 text-caption text-fg-tertiary">
                          <Wrench className="size-3" aria-hidden />
                          {t('usedTools')}
                          {[...new Set(m.tools.map((x) => x.name))].map((n) => (
                            <Badge key={n} tone="neutral">
                              {t.has(`tools.${n}`) ? t(`tools.${n}`) : n}
                            </Badge>
                          ))}
                        </p>
                      ) : null}
                      {m.proposals.map((p, i) => (
                        <div
                          key={i}
                          className="mt-2 rounded-lg border border-brand bg-surface p-2"
                          data-testid="agent-proposal"
                        >
                          <p className="flex items-center gap-1 text-caption font-semibold text-brand">
                            <Sparkles className="size-3" aria-hidden />
                            {t('proposal')}
                          </p>
                          <p className="text-small text-fg">
                            {t(`actions.${p.actionType}`, { name: p.targetName ?? p.targetMetaId })}
                          </p>
                          {p.reason ? <p className="text-caption text-fg-secondary">{p.reason}</p> : null}
                          <Button
                            kind="primary"
                            size="s"
                            className="mt-2"
                            onClick={() => setDialog(p)}
                            disabled={!canPropose}
                          >
                            {t('review')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              <div ref={bottom} />
            </ol>
          )}
        </div>
        <form
          className="border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(q);
          }}
        >
          <div className="flex items-center gap-2">
            <Select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-48"
              aria-label={t('context')}
            >
              <option value="">{t('allAccounts')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              disabled={busy}
              className="h-9 flex-1 rounded-lg border border-line-control bg-surface px-3 text-body text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-none"
            />
            <Button kind="primary" size="m" type="submit" disabled={busy || !q.trim()} aria-label={t('send')}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            </Button>
          </div>
          <p className="mt-1 text-caption text-fg-tertiary">{t('disclaimer')}</p>
        </form>
      </Card>

      {dialog ? (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          type={dialog.actionType}
          targets={[
            {
              adAccountId: dialog.adAccountId,
              metaId: dialog.targetMetaId,
              name: dialog.targetName ?? dialog.targetMetaId,
              dailyBudget: dialog.newDailyBudget ?? null,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
