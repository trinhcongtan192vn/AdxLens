import { getTranslations } from 'next-intl/server';
import { addDays, localDate } from '@adxlens/core/shared';
import { ALERT_METRICS, alertSuggestions, listAlerts, metricValues } from '@adxlens/core/reporting';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AlertsManager } from './alerts-manager';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.alerts') };
}

/**
 * Cảnh báo (Madgicx Alert): chỉ số + điều kiện + ngưỡng theo ngày / 7 ngày; khi tạo hiện trung bình 7 ngày để gợi ý
 * ngưỡng. Danh sách bật / tắt / xóa (ADR-0018).
 */
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsAlerts');
  const sp = await searchParams;
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
      <WsHeader
        title={t('title')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        hideScope
      />
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
