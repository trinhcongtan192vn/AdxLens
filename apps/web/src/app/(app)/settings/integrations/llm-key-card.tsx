'use client';

import { Bot, Route } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Card, Field, Input, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;
type Provider = (typeof PROVIDERS)[number];
const TASKS = ['analysis', 'copywriting', 'image'] as const;
type Task = (typeof TASKS)[number];
const KEY_HINT: Record<Provider, string> = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  gemini: 'AIza…',
  deepseek: 'sk-…',
};
export type LlmKeyView = {
  provider: Provider;
  model: string;
  keyHint: string;
  lastUsedAt: string | null;
  lastError: string | null;
};
export type LlmRouteView = { task: Task; provider: Provider; model: string; source: 'route' | 'default' };

/**
 * Khóa AI tự mang (ADR-0022) + AI router (ADR-0030): mỗi nhà cung cấp một khóa; chọn model cho từng việc (phân tích,
 * viết nội dung, tạo ảnh). Khóa chỉ gửi lên một lần, máy chủ mã hóa; trang chỉ hiện 4 ký tự cuối.
 */
export function LlmKeyCard({
  keys,
  routes,
  models,
  imageModels,
  taskProviders,
  platform,
}: {
  keys: LlmKeyView[];
  routes: LlmRouteView[];
  models: Record<Provider, readonly string[]>;
  imageModels: Partial<Record<Provider, readonly string[]>>;
  taskProviders: Record<Task, readonly Provider[]>;
  /** Nền tảng có khóa mặc định (dùng khi workspace chưa có khóa riêng). */
  platform: boolean;
}) {
  const t = useTranslations('integrations.llm');
  const format = useFormatter();
  const router = useRouter();
  const first = PROVIDERS.find((p) => !keys.some((k) => k.provider === p)) ?? 'anthropic';
  const [provider, setProvider] = useState<Provider>(first);
  const existing = keys.find((k) => k.provider === provider);
  const [model, setModel] = useState(existing?.model ?? models[first][0]!);
  const [key, setKey] = useState('');
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        await api('llm-key', { method: 'PUT', body: { provider, model, api_key: key || null } });
        setKey('');
        toast.success(t('saved'));
        router.refresh();
      } catch {
        toast.error(t('error'));
      }
    });
  const remove = (p: Provider) =>
    start(async () => {
      await api(`llm-key?provider=${p}`, { method: 'DELETE' });
      toast.success(t('removed'));
      router.refresh();
    });

  return (
    <Card data-testid="llm-key-card">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Bot className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 max-w-2xl text-small text-fg-secondary">{t('intro')}</p>

      <div className="mt-3 text-small">
        {keys.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line" data-testid="llm-key-list">
            {keys.map((k) => (
              <li
                key={k.provider}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
                data-testid="llm-key-current"
              >
                <Badge tone={k.lastError ? 'danger' : 'success'}>
                  {k.lastError ? t('statusError') : t('statusOn')}
                </Badge>
                <span className="text-fg">
                  {t('using', { provider: t(`providers.${k.provider}`), model: k.model })}
                </span>
                <code className="font-mono text-caption text-fg-tertiary">…{k.keyHint}</code>
                {k.lastUsedAt ? (
                  <span className="text-caption text-fg-tertiary">
                    {t('lastUsed', {
                      at: format.dateTime(new Date(k.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' }),
                    })}
                  </span>
                ) : null}
                <Button
                  kind="ghost"
                  size="s"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => remove(k.provider)}
                  aria-label={t('removeOf', { provider: t(`providers.${k.provider}`) })}
                >
                  {t('remove')}
                </Button>
                {k.lastError ? (
                  <Banner tone="danger" className="w-full">
                    {t(`errors.${errorKind(k.lastError)}`)}
                  </Banner>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-secondary">{platform ? t('nonePlatform') : t('noneOff')}</p>
        )}
      </div>

      <h3 className="mt-4 text-body font-semibold text-fg">{existing ? t('replaceTitle') : t('addTitle')}</h3>
      <div className="mt-2 grid max-w-3xl gap-3 sm:grid-cols-3">
        <Field label={t('provider')}>
          <Select
            value={provider}
            aria-label={t('provider')}
            onChange={(e) => {
              const p = e.target.value as Provider;
              setProvider(p);
              setModel(keys.find((k) => k.provider === p)?.model ?? models[p][0]!);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`providers.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('model')}>
          <Input
            value={model}
            list={`llm-models-${provider}`}
            onChange={(e) => setModel(e.target.value)}
            maxLength={80}
            aria-label={t('model')}
          />
          <datalist id={`llm-models-${provider}`}>
            {models[provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label={t('key')}>
          <Input
            type="password"
            autoComplete="off"
            value={key}
            placeholder={existing ? t('keyKeep') : KEY_HINT[provider]}
            onChange={(e) => setKey(e.target.value)}
            aria-label={t('key')}
          />
        </Field>
      </div>
      <p className="mt-2 text-caption text-fg-tertiary">
        {t(`where.${provider}`)} {t('modelHint')} {t('security')}
      </p>
      <div className="mt-3 flex gap-2">
        <Button kind="primary" size="m" disabled={pending || !model.trim() || (!key && !existing)} onClick={save}>
          {t('save')}
        </Button>
      </div>

      {keys.length ? (
        <RoutesTable
          keys={keys}
          routes={routes}
          models={models}
          imageModels={imageModels}
          taskProviders={taskProviders}
        />
      ) : null}
    </Card>
  );
}

/** ADR-0030: model cho từng việc. Chỉ liệt kê nhà cung cấp đã có khóa và làm được việc đó. */
function RoutesTable({
  keys,
  routes,
  models,
  imageModels,
  taskProviders,
}: {
  keys: LlmKeyView[];
  routes: LlmRouteView[];
  models: Record<Provider, readonly string[]>;
  imageModels: Partial<Record<Provider, readonly string[]>>;
  taskProviders: Record<Task, readonly Provider[]>;
}) {
  const t = useTranslations('integrations.llm');
  return (
    <section className="mt-6 border-t border-line pt-4" data-testid="llm-routes">
      <h3 className="flex items-center gap-2 text-body font-semibold text-fg">
        <Route className="size-4 text-fg-tertiary" aria-hidden />
        {t('routesTitle')}
      </h3>
      <p className="mt-1 max-w-2xl text-small text-fg-secondary">{t('routesIntro')}</p>
      <div className="mt-3 grid gap-3">
        {TASKS.map((task) => (
          <RouteRow
            key={task}
            task={task}
            current={routes.find((r) => r.task === task) ?? null}
            providers={taskProviders[task].filter((p) => keys.some((k) => k.provider === p))}
            modelsOf={(p) => (task === 'image' ? (imageModels[p] ?? []) : models[p])}
          />
        ))}
      </div>
    </section>
  );
}

function RouteRow({
  task,
  current,
  providers,
  modelsOf,
}: {
  task: Task;
  current: LlmRouteView | null;
  providers: Provider[];
  modelsOf: (p: Provider) => readonly string[];
}) {
  const t = useTranslations('integrations.llm');
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | ''>(current?.provider ?? providers[0] ?? '');
  const [model, setModel] = useState(current?.model ?? (providers[0] ? (modelsOf(providers[0])[0] ?? '') : ''));
  const [pending, start] = useTransition();
  const call = (method: 'PUT' | 'DELETE') =>
    start(async () => {
      try {
        if (method === 'PUT') await api('llm-routes', { method, body: { task, provider, model } });
        else await api(`llm-routes?task=${task}`, { method });
        toast.success(t('routeSaved'));
        router.refresh();
      } catch {
        toast.error(t('routeError'));
      }
    });
  const fixedModels = task === 'image';

  return (
    <div
      className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
      data-testid={`llm-route-${task}`}
    >
      <div>
        <p className="flex items-center gap-2 text-small font-semibold text-fg">
          {t(`tasks.${task}`)}
          {current ? (
            <Badge tone={current.source === 'route' ? 'info' : 'neutral'}>
              {current.source === 'route' ? t('routeCustom') : t('routeDefault')}
            </Badge>
          ) : null}
        </p>
        <p className="text-caption text-fg-tertiary">
          {current
            ? t('using', { provider: t(`providers.${current.provider}`), model: current.model })
            : t(`routeNone.${task}`)}
        </p>
      </div>
      {providers.length ? (
        <>
          <Field label={t('provider')}>
            <Select
              value={provider}
              aria-label={`${t(`tasks.${task}`)} — ${t('provider')}`}
              onChange={(e) => {
                const p = e.target.value as Provider;
                setProvider(p);
                setModel(modelsOf(p)[0] ?? '');
              }}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {t(`providers.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('model')}>
            {fixedModels ? (
              <Select
                value={model}
                aria-label={`${t(`tasks.${task}`)} — ${t('model')}`}
                onChange={(e) => setModel(e.target.value)}
              >
                {(provider ? modelsOf(provider) : []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            ) : (
              <>
                <Input
                  value={model}
                  list={`llm-route-models-${task}-${provider}`}
                  onChange={(e) => setModel(e.target.value)}
                  maxLength={80}
                  aria-label={`${t(`tasks.${task}`)} — ${t('model')}`}
                />
                <datalist id={`llm-route-models-${task}-${provider}`}>
                  {(provider ? modelsOf(provider) : []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              kind="secondary"
              size="m"
              disabled={pending || !provider || !model.trim()}
              onClick={() => call('PUT')}
            >
              {t('routeSave')}
            </Button>
            {current?.source === 'route' ? (
              <Button kind="ghost" size="m" disabled={pending} onClick={() => call('DELETE')}>
                {t('routeReset')}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-caption text-fg-tertiary sm:col-span-3">{t(`routeMissing.${task}`)}</p>
      )}
    </div>
  );
}

function errorKind(code: string): 'auth' | 'quota' | 'model' | 'other' {
  if (code === 'LLM_HTTP_401' || code === 'LLM_HTTP_403') return 'auth';
  if (code === 'LLM_HTTP_429' || code === 'LLM_HTTP_402') return 'quota';
  if (code === 'LLM_HTTP_404' || code === 'LLM_HTTP_400') return 'model';
  return 'other';
}
