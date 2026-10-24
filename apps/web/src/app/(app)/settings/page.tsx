import { redirect } from 'next/navigation';
import { settingsTabs } from '@/lib/settings-tabs';
import { getPageContext } from '@/server/page-context';

/** /settings → tab đầu tiên vai trò được thấy. */
export default async function SettingsIndex() {
  const pc = await getPageContext();
  redirect(`/settings/${settingsTabs(pc.actor.role, pc.flags)[0]}`);
}
