import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { toLocale } from '@/i18n/locale';
import { visibleNav } from '@/lib/nav';
import { PERIOD_COOKIE, toPeriod } from '@/lib/period';
import { getPageContext } from '@/server/page-context';
import { getShellExtras } from '@/server/shell-extras';

/** Khung app (Penpot O01): thanh trên toàn chiều ngang, sidebar 224px bên dưới. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const pc = await getPageContext();
  const store = await cookies();
  const period = toPeriod(store.get(PERIOD_COOKIE)?.value);
  const extras = await getShellExtras(pc);
  return (
    <div className="min-h-screen">
      <TopBar
        period={period}
        workspaces={pc.workspaces}
        currentWorkspaceId={pc.workspace.id}
        user={{ email: pc.user.email, fullName: pc.user.fullName }}
        locale={toLocale(pc.user.locale)}
        unread={extras.unread}
      />
      <div className="flex">
        <Sidebar items={visibleNav(pc.flags, pc.actor.role)} />
        <div className="min-w-0 flex-1">
          {extras.banner}
          <main className="px-4 py-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
