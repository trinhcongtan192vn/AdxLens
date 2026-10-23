import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/server/page-context';
import { CreateWorkspaceForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

/** A07 Tạo workspace (sau khi xác minh email lần đầu). */
export default async function CreateWorkspacePage() {
  const user = await requireUser('/onboarding/workspace');
  return <CreateWorkspaceForm locale={user.locale === 'en' ? 'en' : 'vi'} />;
}
