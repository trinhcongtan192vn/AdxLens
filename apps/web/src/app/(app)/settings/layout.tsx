import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { settingsTabs } from '@/lib/settings-tabs';
import { getPageContext } from '@/server/page-context';
import { SettingsTabBar } from './tab-bar';

/** Khung Cài đặt: tiêu đề "Cài đặt" và thanh tab dùng chung (Penpot ST01, ST02, ST06). */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const pc = await getPageContext();
  const t = await getTranslations();
  const tabs = settingsTabs(pc.actor.role, pc.flags).map((k) => ({ key: k, label: t(`settings.${k}`) }));
  return (
    <div className="max-w-[1184px]">
      <h1 className="text-h1 font-semibold text-fg">{t('nav.settings')}</h1>
      <SettingsTabBar tabs={tabs} />
      <div className="pt-4">{children}</div>
    </div>
  );
}
