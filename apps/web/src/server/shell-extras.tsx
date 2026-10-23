import 'server-only';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { connectionHealth } from '@adxlens/core/connections';
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
  return null;
}

let unreadSource: ((pc: PageContext) => Promise<number>) | null = null;
export function registerUnreadSource(s: (pc: PageContext) => Promise<number>): void {
  unreadSource = s;
}

export async function getShellExtras(pc: PageContext): Promise<{ unread: number; banner: ReactNode }> {
  const banner = await systemBanner(pc);
  const unread = unreadSource ? await unreadSource(pc) : 0;
  return { unread, banner: banner ? <div className="px-4 pt-4">{banner}</div> : null };
}
