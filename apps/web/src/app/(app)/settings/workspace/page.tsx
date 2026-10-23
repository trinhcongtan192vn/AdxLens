import { getTranslations } from 'next-intl/server';
import { getWorkspace } from '@adxlens/core/tenancy';
import { deps } from '@/server/deps';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { DeleteWorkspace } from './delete';
import { WorkspaceForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('workspace') };
}

/** ST01 Workspace (chỉ owner). */
export default async function WorkspaceSettingsPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'workspace.manage');
  const ws = await getWorkspace(pc.ctx);
  const { storage } = deps();
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <WorkspaceForm
        initial={{
          name: ws.name,
          timezone: ws.defaultTimezone,
          locale: ws.defaultLocale === 'en' ? 'en' : 'vi',
          primaryColor: ws.brand.primary_color ?? '#4F46E5',
          reportFromEmail: ws.reportFromEmail ?? '',
          logoUrl: ws.brand.logo_path ? storage.publicUrl('brand', ws.brand.logo_path) : null,
        }}
      />
      <DeleteWorkspace name={ws.name} />
    </div>
  );
}
