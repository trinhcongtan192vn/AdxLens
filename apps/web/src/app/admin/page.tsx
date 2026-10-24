import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Card, CardHeader, EmptyState } from '@adxlens/ui';
import { INBOX_KEYS, type InboxKey } from '@adxlens/core/ops';
import { adminInboxForRequest, requireStaff } from '@/server/admin-context';

export async function generateMetadata() {
  const t = await getTranslations('admin.today');
  return { title: t('title') };
}

const HREF: Record<InboxKey, string> = {
  incidents: '/admin/incidents',
  syncs: '/admin/operations',
  reconciliation: '/admin/reconciliation',
  breakers: '/admin/execution',
  billing: '/admin/billing',
  deletions: '/admin/deletions',
  flagProposals: '/admin/flags',
};

/**
 * "Hôm nay" — trang vào của admin: mọi việc đang chờ trên toàn hệ thống, việc khẩn lên trước. Mỗi thẻ: số lượng, việc
 * tồn lâu nhất, tối đa 3 mục (link về workspace), nút tới trang xử lý. Không còn việc → "Mọi thứ ổn".
 */
export default async function AdminToday() {
  const { staff } = await requireStaff();
  const t = await getTranslations('admin.today');
  const format = await getFormatter();
  const inbox = await adminInboxForRequest();
  const keys = [...INBOX_KEYS]
    .filter((k) => inbox.items[k].count > 0)
    .sort((a, b) => Number(inbox.items[b].urgent) - Number(inbox.items[a].urgent));
  const now = new Date();

  return (
    <div className="max-w-[1100px]">
      <h1 className="text-h1 font-semibold">{t('title')}</h1>
      <p className="mb-4 text-body text-fg-secondary">{t('subtitle', { count: inbox.total })}</p>
      {keys.length === 0 ? (
        <Card>
          <EmptyState title={t('allClear')} description={t('allClearBody')} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="admin-today">
          {keys.map((k) => {
            const it = inbox.items[k];
            return (
              <Card key={k} data-testid={`today-${k}`}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {t(`items.${k}.title`)}
                      <Badge tone={it.urgent ? 'danger' : 'neutral'}>{it.count}</Badge>
                    </span>
                  }
                  actions={
                    <Link href={HREF[k]} className="text-body font-medium text-link hover:underline">
                      {t('handle')}
                    </Link>
                  }
                />
                <div className="px-4 pb-3 text-body">
                  <p className="text-small text-fg-secondary">
                    {t(`items.${k}.body`)}
                    {k === 'flagProposals' && staff.role !== 'superadmin' ? ` ${t('waitSuperadmin')}` : ''}
                  </p>
                  {it.oldestAt ? (
                    <p className="mt-1 text-small text-fg-tertiary">
                      {t('oldest', { when: format.relativeTime(it.oldestAt, now) })}
                    </p>
                  ) : null}
                  <ul className="mt-2 space-y-1">
                    {it.top.map((x, i) => (
                      <li key={i} className="flex items-center gap-2 text-small">
                        <span className="flex-1 truncate">{x.label}</span>
                        {x.workspaceId ? (
                          <Link
                            href={`/admin/workspaces/${x.workspaceId}`}
                            className="truncate text-link hover:underline"
                          >
                            {x.workspaceName}
                          </Link>
                        ) : (
                          <span className="text-fg-tertiary">{t('system')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {it.count > it.top.length ? (
                    <p className="mt-1 text-small text-fg-tertiary">{t('more', { count: it.count - it.top.length })}</p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-small text-fg-tertiary">
        {t('killSwitch')}{' '}
        <Link href="/admin/kill-switch" className="text-link hover:underline">
          {inbox.killSwitch.active ? t('ksOn') : t('ksOff')}
        </Link>
      </p>
    </div>
  );
}
