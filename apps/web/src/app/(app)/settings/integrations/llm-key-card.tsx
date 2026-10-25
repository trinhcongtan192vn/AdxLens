'use client';

import { Bot } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Card, Field, Input, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;
type Provider = (typeof PROVIDERS)[number];
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

/**
 * Khóa AI tự mang (ADR-0022): AI Agents chạy bằng tài khoản Anthropic / OpenAI / Gemini / DeepSeek của agency. Khóa chỉ gửi lên một lần,
 * máy chủ mã hóa; trang chỉ hiện 4 ký tự cuối.
 */
export function LlmKeyCard({
  current,
  models,
  platform,
}: {
  current: LlmKeyView | null;
  models: Record<Provider, readonly string[]>;
  /** Nền tảng có khóa mặc định (dùng khi workspace chưa có khóa riêng). */
  platform: boolean;
}) {
  const t = useTranslations('integrations.llm');
  const format = useFormatter();
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(current?.provider ?? 'anthropic');
  const [model, setModel] = useState(current?.model ?? models.anthropic[0]!);
  const [key, setKey] = useState('');
  const [pending, start] = useTransition();
  const sameProvider = current?.provider === provider;

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
  const remove = () =>
    start(async () => {
      await api('llm-key', { method: 'DELETE' });
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
        {current ? (
          <p className="flex flex-wrap items-center gap-2 text-fg" data-testid="llm-key-current">
            <Badge tone={current.lastError ? 'danger' : 'success'}>
              {current.lastError ? t('statusError') : t('statusOn')}
            </Badge>
            {t('using', { provider: t(`providers.${current.provider}`), model: current.model })}
            <code className="font-mono text-caption text-fg-tertiary">…{current.keyHint}</code>
            {current.lastUsedAt ? (
              <span className="text-caption text-fg-tertiary">
                {t('lastUsed', {
                  at: format.dateTime(new Date(current.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' }),
                })}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-fg-secondary">{platform ? t('nonePlatform') : t('noneOff')}</p>
        )}
        {current?.lastError ? (
          <Banner tone="danger" className="mt-2">
            {t(`errors.${errorKind(current.lastError)}`)}
          </Banner>
        ) : null}
      </div>

      <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
        <Field label={t('provider')}>
          <Select
            value={provider}
            aria-label={t('provider')}
            onChange={(e) => {
              const p = e.target.value as Provider;
              setProvider(p);
              setModel(current?.provider === p ? current.model : models[p][0]!);
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
            placeholder={sameProvider ? t('keyKeep') : KEY_HINT[provider]}
            onChange={(e) => setKey(e.target.value)}
            aria-label={t('key')}
          />
        </Field>
      </div>
      <p className="mt-2 text-caption text-fg-tertiary">
        {t(`where.${provider}`)} {t('modelHint')} {t('security')}
      </p>
      <div className="mt-3 flex gap-2">
        <Button kind="primary" size="m" disabled={pending || !model.trim() || (!key && !sameProvider)} onClick={save}>
          {t('save')}
        </Button>
        {current ? (
          <Button kind="secondary" size="m" disabled={pending} onClick={remove}>
            {t('remove')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function errorKind(code: string): 'auth' | 'quota' | 'model' | 'other' {
  if (code === 'LLM_HTTP_401' || code === 'LLM_HTTP_403') return 'auth';
  if (code === 'LLM_HTTP_429' || code === 'LLM_HTTP_402') return 'quota';
  if (code === 'LLM_HTTP_404' || code === 'LLM_HTTP_400') return 'model';
  return 'other';
}
