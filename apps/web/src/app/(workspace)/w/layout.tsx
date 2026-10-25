import type { ReactNode } from 'react';
import { WsAskBar } from '@/components/workspace/ws-ask-bar';
import { WsSidebar, type CreateItem } from '@/components/workspace/ws-sidebar';
import { visibleWNav, W_NAV, W_NAV_BOTTOM } from '@/lib/workspace-nav';
import { getPageContext } from '@/server/page-context';
import { getShellExtras } from '@/server/shell-extras';

/**
 * Khung giao diện Workspace (lộ trình W3): song song giao diện cổ điển, bố cục theo Madgicx Workspace (sidebar trái có
 * nút Tạo, nội dung rộng). Cờ kiểm ở server: mục P1 / P2 ẩn khi cờ tắt.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pc = await getPageContext();
  const extras = await getShellExtras(pc);
  const manage = pc.actor.role !== 'buyer';
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
        items={visibleWNav(W_NAV, pc.flags)}
        bottom={visibleWNav(W_NAV_BOTTOM, pc.flags)}
        create={create}
        workspaceName={pc.workspace.name}
        unread={extras.unread}
      />
      <div className="min-w-0 flex-1">
        <div className="print:hidden">{extras.banner}</div>
        <main className="mx-auto max-w-[1400px] px-6 pb-20 pt-5 print:max-w-none print:px-0 print:pb-0">
          {children}
        </main>
      </div>
      {pc.flags.p1_recommendations ? <WsAskBar /> : null}
    </div>
  );
}
