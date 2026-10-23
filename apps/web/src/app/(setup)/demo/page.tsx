import { getTranslations } from 'next-intl/server';
import { demoConnection } from '@adxlens/core/connections';
import { SetupShell } from '@/components/setup-shell';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { StartDemo } from './start-demo';

export async function generateMetadata() {
  const t = await getTranslations('demo');
  return { title: t('title') };
}

/** S01 Demo tài khoản mẫu (PRD P0-02): giải thích + "Dùng tài khoản mẫu". */
export default async function DemoPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'connections.manage');
  const t = await getTranslations('demo');
  const tc = await getTranslations('connect');
  const existing = await demoConnection(pc.ctx);
  return (
    <SetupShell stepLabel={tc('step', { n: 2, total: 4 })}>
      <h1 className="text-h2 font-semibold text-fg">{t('title')}</h1>
      <p className="mt-3 text-body text-fg-secondary">{t('body')}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-body text-fg">
        <li>{t('points.match')}</li>
        <li>{t('points.findings')}</li>
        <li>{t('points.safe')}</li>
      </ul>
      <StartDemo exists={Boolean(existing)} />
    </SetupShell>
  );
}
