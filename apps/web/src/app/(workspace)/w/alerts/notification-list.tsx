'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button, Card, EmptyState, Segmented } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { NOTIFICATION_GROUPS, notificationGroup, type NotificationGroup } from '@/lib/notification-groups';

type Item = { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; when: string };

/** Hộp thư (PM 25/10: gộp Thông báo + Cảnh báo): lọc theo loại / chưa đọc; bấm để mở và đánh dấu đã đọc. */
export function NotificationList({ items }: { items: Item[] }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [group, setGroup] = useState<NotificationGroup | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const shown = items.filter(
    (n) => (group === 'all' || notificationGroup(n.kind) === group) && (!unreadOnly || !n.read),
  );
  const open = (n: Item) =>
    start(async () => {
      if (!n.read) await api(`notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      if (n.link) router.push(n.link);
      else router.refresh();
    });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="inbox-filters">
        <Segmented
          value={group}
          onChange={(v: string) => setGroup(v as NotificationGroup | 'all')}
          options={(['all', ...NOTIFICATION_GROUPS] as const).map((g) => ({ value: g, label: t(`groups.${g}`) }))}
        />
        <label className="flex items-center gap-2 text-small text-fg-secondary">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          {t('unreadOnly')}
        </label>
        <div className="flex-1" />
        {items.some((n) => !n.read) ? (
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
        ) : null}
      </div>
      <Card className={shown.length ? 'p-0' : undefined}>
        {shown.length === 0 ? (
          <EmptyState icon={<Bell />} title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <ul className="divide-y divide-line" data-testid="inbox">
            {shown.map((n) => (
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
        )}
      </Card>
    </>
  );
}
