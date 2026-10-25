import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { listAdAccounts } from '@adxlens/core/connections';
import { listClients } from '@adxlens/core/tenancy';
import { toLocale } from '@/i18n/locale';
import { PERIOD_COOKIE, toPeriod } from '@/lib/period';
import { shellNav } from '@/lib/workspace-nav';
import { getPageContext } from '@/server/page-context';
import { getShellExtras } from '@/server/shell-extras';
import { PageToolbar } from './page-toolbar';
import { WsAskBar } from './ws-ask-bar';
import { WsSidebar, type CreateItem } from './ws-sidebar';

/**
 * Khung duy nhất của app (bố cục Madgicx Workspace): dùng cho cả trang `/w/*` và các trang có từ giao diện cổ điển, để
 * mở chi tiết chiến dịch / nhóm QC / QC / khách không đổi sidebar. Cờ kiểm ở server: mục P1 / P2 ẩn khi cờ tắt.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const pc = await getPageContext();
  const store = await cookies();
  const extras = await getShellExtras(pc);
  const manage = pc.actor.role !== 'buyer';
  // G3: danh sách khách cho bộ chọn + bản đồ tài khoản → Client để biết đang ở phạm vi khách nào.
  const [clientRows, accountRows] = await Promise.all([listClients(pc.ctx), listAdAccounts(pc.ctx)]);
  const clients = clientRows.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name }));
  const accountClients = Object.fromEntries(accountRows.map((a) => [a.id, a.clientId]));
  const { groups, bottom } = shellNav(pc.flags, pc.actor.role);
  const create: CreateItem[] = [
    ...(pc.flags.p0_reports && manage ? [{ key: 'report' as const, href: '/reports/new' }] : []),
    { key: 'manageAds', href: '/w/ads-manager' },
    ...(pc.flags.p1_recommendations ? [{ key: 'agent' as const, href: '/w/agents' }] : []),
    ...(pc.flags.p2b_auto && manage ? [{ key: 'rule' as const, href: '/automation/new' }] : []),
    { key: 'alert', href: '/w/alerts?new=1' },
  ];
  return (
    <div className="flex min-h-screen bg-canvas">
      <WsSidebar
        groups={groups}
        bottom={bottom}
        create={create}
        workspaces={pc.workspaces}
        currentWorkspaceId={pc.workspace.id}
        user={{ email: pc.user.email, fullName: pc.user.fullName }}
        locale={toLocale(pc.user.locale)}
        unread={extras.unread}
        clients={clients}
        accountClients={accountClients}
        flags={pc.flags}
        role={pc.actor.role}
      />
      <div className="min-w-0 flex-1">
        <div className="print:hidden">{extras.banner}</div>
        <main className="mx-auto max-w-[1400px] px-6 pb-20 pt-5 print:max-w-none print:px-0 print:pb-0">
          <PageToolbar period={toPeriod(store.get(PERIOD_COOKIE)?.value)} />
          {children}
        </main>
      </div>
      {pc.flags.p1_recommendations ? <WsAskBar /> : null}
    </div>
  );
}
