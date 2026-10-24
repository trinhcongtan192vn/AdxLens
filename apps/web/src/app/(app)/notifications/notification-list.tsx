'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button, Card } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Item = { id: string; title: string; body: string; link: string | null; read: boolean; when: string };

export function NotificationList({ items }: { items: Item[] }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = (n: Item) =>
    start(async () => {
      if (!n.read) await api(`notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      if (n.link) router.push(n.link);
      else router.refresh();
    });
  return (
    <>
      {items.some((n) => !n.read) ? (
        <div className="mb-3 flex justify-end">
          <Button
            kind="secondary"
            size="s"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await api('notifications', { method: 'POST' }).catch(() => undefined);
                router.refresh();
              })
            }
          >
            {t('markAll')}
          </Button>
        </div>
      ) : null}
      <Card>
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover"
              >
                <span
                  aria-label={n.read ? undefined : t('unread')}
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-body ${n.read ? 'text-fg-secondary' : 'font-medium text-fg'}`}>
                    {n.title}
                  </span>
                  <span className="block text-small text-fg-secondary">{n.body}</span>
                </span>
                <span className="shrink-0 text-caption text-fg-tertiary">{n.when}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
