import 'server-only';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { billingStatus } from '@adxlens/core/billing';
import { killSwitchState } from '@adxlens/core/execution';
import { connectionHealth, demoConnection, listAdAccounts } from '@adxlens/core/connections';
import { syncStatuses } from '@adxlens/core/ingestion';
import { AutoRefresh } from '@/components/auto-refresh';
import { DemoActions } from '@/components/demo-actions';
import { backgroundSync } from '@/lib/sync-progress';
import { unreadCount } from '@adxlens/core/notification';
import { activeMaintenanceNotice } from '@adxlens/core/ops';
import { can } from '@adxlens/core/tenancy';
import { Banner } from '@adxlens/ui';
import type { PageContext } from './page-context';

/**
 * Banner hệ thống X04 (mỗi lần một cái, design-system Banner): token hết hạn → past_due → vượt hạn
 * mức → kill switch → dữ liệu mẫu. Feature sau thêm nguồn của mình theo đúng thứ tự ưu tiên.
 */
async function systemBanner(pc: PageContext): Promise<ReactNode> {
  const t = await getTranslations('banners');
  const health = await connectionHealth(pc.ctx);
  if (health.expired.length) {
    return (
      <Banner
        tone="danger"
        action={
          can(pc.actor.role, 'connections.manage') ? (
            <Link href="/connections" className="text-body font-medium underline">
              {t('reconnect')}
            </Link>
          ) : null
        }
      >
        {t('tokenExpired', { count: health.expired.length })}
      </Banner>
    );
  }
  // X04 kill switch (P2a): mọi thay đổi trên Meta đang tạm dừng.
  if (pc.flags.p2a_approve) {
    const k = await killSwitchState(pc.ctx);
    if (k.global || k.workspace) {
      return (
        <Banner
          tone="danger"
          action={
            k.workspace && can(pc.actor.role, 'guardrails.manage') ? (
              <Link href="/settings/guardrails" className="text-body font-medium underline">
                {t('openKillSwitch')}
              </Link>
            ) : null
          }
        >
          {k.global ? t('killSwitchGlobal') : t('killSwitch')}
        </Banner>
      );
    }
  }
  // X04 past_due + vượt hạn mức (026, PRD 13.3).
  const billing = await billingStatus(pc.ctx);
  const billingLink = can(pc.actor.role, 'billing.manage') ? (
    <Link href="/settings/billing" className="text-body font-medium underline">
      {t('openBilling')}
    </Link>
  ) : null;
  if (billing.status === 'past_due') {
    return (
      <Banner tone="danger" action={billingLink}>
        {t('pastDue')}
      </Banner>
    );
  }
  if (billing.overLimit) {
    return (
      <Banner tone={billing.graceExpired ? 'danger' : 'warning'} action={billingLink}>
        {billing.graceExpired
          ? t('overLimitExpired', { limit: billing.plan.includedAccounts })
          : t('overLimit', { active: billing.activeAccounts, limit: billing.plan.includedAccounts })}
      </Banner>
    );
  }
  // X04 biến thể "dữ liệu mẫu" (S01).
  if (await demoConnection(pc.ctx)) {
    const td = await getTranslations('demo');
    return (
      <Banner tone="info" action={can(pc.actor.role, 'connections.manage') ? <DemoActions /> : null}>
        {td('banner')}
      </Banner>
    );
  }
  return null;
}

let unreadSource: ((pc: PageContext) => Promise<number>) | null = null;
export function registerUnreadSource(s: (pc: PageContext) => Promise<number>): void {
  unreadSource = s;
}

/** Thông báo bảo trì của đội AdxLens (ADR-0013), hiện thêm trên banner hệ thống, theo ngôn ngữ người dùng. */
async function maintenanceBanner(pc: PageContext): Promise<ReactNode> {
  const n = await activeMaintenanceNotice(pc.ctx.db);
  if (!n) return null;
  return (
    <div data-testid="maintenance-banner">
      <Banner tone="info">{pc.user.locale === 'en' ? n.messageEn : n.messageVi}</Banner>
    </div>
  );
}

/**
 * Đồng bộ 90 ngày / đồng bộ lại đang chạy ở nền: người dùng dùng app ngay, số liệu hiện dần (khối 7 ngày, mới nhất
 * trước), trang tự làm mới tới khi xong. Ghi rõ số liệu chưa đủ và chưa đối chiếu với Meta.
 */
async function syncBanner(pc: PageContext): Promise<ReactNode> {
  const accounts = await listAdAccounts(pc.ctx);
  if (!accounts.length) return null;
  const statuses = await syncStatuses(
    pc.ctx,
    accounts.map((a) => a.id),
  );
  const s = backgroundSync(
    [...statuses.values()].map((x) => ({
      kind: x.kind,
      status: x.status,
      daysDone: x.progress.daysDone,
      daysTotal: x.progress.daysTotal,
      error: x.error,
    })),
  );
  if (!s) return null;
  const t = await getTranslations('sync');
  return (
    <div data-testid="sync-banner">
      <AutoRefresh />
      <Banner
        tone="info"
        action={
          can(pc.actor.role, 'connections.manage') ? (
            <Link href="/connections/sync" className="text-body font-medium underline">
              {t('banner.link')}
            </Link>
          ) : null
        }
      >
        {t('banner.body', { percent: s.percent, count: s.accounts })}
      </Banner>
    </div>
  );
}

export async function getShellExtras(pc: PageContext): Promise<{ unread: number; banner: ReactNode }> {
  const [maintenance, banner, sync] = await Promise.all([maintenanceBanner(pc), systemBanner(pc), syncBanner(pc)]);
  const unread = unreadSource ? await unreadSource(pc) : await unreadCount(pc.ctx, pc.actor.userId);
  return {
    unread,
    banner:
      maintenance || banner || sync ? (
        <div className="flex flex-col gap-2 px-4 pt-4">
          {maintenance}
          {banner}
          {sync}
        </div>
      ) : null,
  };
}
