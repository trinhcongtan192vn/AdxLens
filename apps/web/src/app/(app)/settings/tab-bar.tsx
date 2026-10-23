'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TabBar, tabItemClass } from '@adxlens/ui';

export function SettingsTabBar({ tabs }: { tabs: { key: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <TabBar className="mt-3 border-b-0">
      {tabs.map((tab) => {
        const href = `/settings/${tab.key}`;
        const active = pathname.startsWith(href);
        return (
          <Link key={tab.key} href={href} role="tab" aria-selected={active} className={tabItemClass(active)}>
            {tab.label}
          </Link>
        );
      })}
    </TabBar>
  );
}
