import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { listNotifications } from '@adxlens/core/notification';
import { addDays, localDate } from '@adxlens/core/shared';
import { ALERT_METRICS, alertSuggestions, listAlerts, metricValues } from '@adxlens/core/reporting';
import { tabItemClass, TabBar } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext } from '@/server/page-context';
import { translateText } from '@/server/translate';
import { workspaceScope } from '@/server/workspace-scope';
import { AlertsManager } from './alerts-manager';
import { NotificationList } from './notification-list';

export async function generateMetadata() {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

/**
 * Thông báo (PM 25/10: gộp Thông báo + Cảnh báo thành một màn):
 * - Hộp thư: mọi sự kiện đã xảy ra (X05, P0-25), lọc theo loại / chưa đọc;
 * - Quy tắc cảnh báo (Madgicx Alert, ADR-0018): chỉ số + điều kiện + ngưỡng; khi tạo hiện trung bình 7 ngày để gợi ý.
 */
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ new?: string; tab?: string }> }) {
  const pc = await getPageContext();
  const t = await getTranslations('notifications');
  const sp = await searchParams;
  const tab = sp.tab === 'rules' || sp.new === '1' ? 'rules' : 'inbox';
  const tabs = (
    <TabBar className="mb-4">
      {(['inbox', 'rules'] as const).map((k) => (
        <Link
          key={k}
          href={k === 'inbox' ? '/w/alerts' : '/w/alerts?tab=rules'}
          role="tab"
          aria-selected={tab === k}
          className={tabItemClass(tab === k)}
        >
          {t(`tabs.${k}`)}
        </Link>
      ))}
    </TabBar>
  );
  if (tab === 'inbox') {
    const format = await getFormatter();
    const locale = pc.user.locale === 'en' ? 'en' : 'vi';
    const items = await listNotifications(pc.ctx, pc.actor.userId);
    return (
      <>
        <WsHeader title={t('title')} subtitle={t('subtitle')} accounts={[]} selectedId={null} hideScope />
        {tabs}
        <NotificationList
          items={items.map((n) => ({
            id: n.id,
            kind: n.kind,
            title: translateText(locale, { key: `notifications.kinds.${n.kind}.title`, params: n.params }),
            body: translateText(locale, { key: `notifications.kinds.${n.kind}.body`, params: n.params }),
            link: n.link,
            read: n.readAt !== null,
            when: format.dateTime(n.createdAt, { dateStyle: 'short', timeStyle: 'short' }),
          }))}
        />
      </>
    );
  }
  const scope = await workspaceScope(pc);
  const alerts = await listAlerts(pc.ctx);
  // Gợi ý ngưỡng: giá trị 7 ngày qua của từng tài khoản (và "mọi tài khoản" cùng tiền tệ chính).
  const hints: Record<string, Record<string, string | null>> = {};
  const range = (tz: string) => {
    const y = addDays(localDate(new Date(), tz), -1);
    return { from: addDays(y, -6), to: y };
  };
  for (const a of scope.accounts.slice(0, 30)) hints[a.id] = await metricValues(pc.ctx, [a.id], range(a.timezone));
  const mainIds = scope.accounts.filter((a) => a.currency === scope.currency).map((a) => a.id);
  hints.all = await metricValues(pc.ctx, mainIds, range(scope.timezone));
  const suggestions = await alertSuggestions(pc.ctx, scope.ids, scope.timezone);
  return (
    <>
      <WsHeader title={t('title')} subtitle={t('subtitle')} accounts={[]} selectedId={null} hideScope />
      {tabs}
      <AlertsManager
        openNew={sp.new === '1'}
        canAll={pc.actor.role !== 'buyer'}
        metrics={ALERT_METRICS}
        accounts={scope.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        mainCurrency={scope.currency}
        defaultAccountId={scope.selected?.id ?? null}
        hints={hints}
        suggestions={suggestions}
        alerts={alerts.map((a) => ({
          id: a.id,
          adAccountId: a.adAccountId,
          currency: a.currency,
          metric: a.metric,
          condition: a.condition,
          threshold: a.threshold,
          window: a.window,
          enabled: a.enabled,
          lastFiredOn: a.lastFiredOn,
          lastValue: a.lastValue,
        }))}
      />
    </>
  );
}
