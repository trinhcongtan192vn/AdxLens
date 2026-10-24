import { getTranslations } from 'next-intl/server';
import { listWorkspacesForUser } from '@adxlens/core/tenancy';
import { deps } from '@/server/deps';
import { requireUser } from '@/server/page-context';
import { CreateWorkspaceForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

/** A07 Tạo workspace: lần đầu sau khi xác minh email, hoặc thêm workspace từ bộ chọn workspace. */
export default async function CreateWorkspacePage() {
  const user = await requireUser('/onboarding/workspace');
  const existing = await listWorkspacesForUser(deps().db, user.id);
  return <CreateWorkspaceForm locale={user.locale === 'en' ? 'en' : 'vi'} another={existing.length > 0} />;
}
