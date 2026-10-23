import 'server-only';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { billingStatus } from '@adxlens/core/billing';
import { killSwitchState } from '@adxlens/core/execution';
import { connectionHealth, demoConnection } from '@adxlens/core/connections';
import { DemoActions } from '@/components/demo-actions';
import { unreadCount } from '@adxlens/core/notification';
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

export async function getShellExtras(pc: PageContext): Promise<{ unread: number; banner: ReactNode }> {
  const banner = await systemBanner(pc);
  const unread = unreadSource ? await unreadSource(pc) : await unreadCount(pc.ctx, pc.actor.userId);
  return { unread, banner: banner ? <div className="px-4 pt-4">{banner}</div> : null };
}
