import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buyerOnboarding } from '@adxlens/core/recommendation';
import { Card } from '@adxlens/ui';
import { getPageContext, requireFlag } from '@/server/page-context';
import { WelcomeActions } from './welcome-actions';

export async function generateMetadata() {
  const t = await getTranslations('welcome');
  return { title: t('title') };
}

/**
 * A08 Onboarding theo vai trò cho media buyer (P1-11): không cần cấu hình gì; cho thấy Client được giao và
 * việc tuần này, rồi dẫn vào làm. Đã đóng hoặc không phải buyer → về Tổng quan.
 */
export default async function WelcomePage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const data = await buyerOnboarding(pc.ctx);
  if (!data) redirect('/overview');
  const t = await getTranslations('welcome');
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 py-6">
      <h1 className="text-h1 font-semibold text-fg">{t('title', { name: pc.user.fullName ?? '' })}</h1>
      <p className="text-body text-fg-secondary">{t('intro')}</p>
      <Card className="px-4 py-4">
        <h2 className="text-h3 font-semibold text-fg">{t('clientsTitle')}</h2>
        {data.clients.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-fg">
            {data.clients.map((c) => (
              <li key={c.id}>{t('client', { name: c.name, count: c.accounts })}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body text-fg-secondary">{t('noClients')}</p>
        )}
      </Card>
      <Card className="px-4 py-4">
        <h2 className="text-h3 font-semibold text-fg">{t('howTitle')}</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-body text-fg">
          <li>{t('step1', { count: data.weekItems })}</li>
          <li>{t('step2', { count: data.assignedToMe })}</li>
          <li>{t('step3')}</li>
        </ol>
      </Card>
      <WelcomeActions />
    </div>
  );
}
