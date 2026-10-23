import { getTranslations } from 'next-intl/server';
import { getPageContext } from '@/server/page-context';
import { ProfileForm } from './form';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('profile') };
}

/** ST06 Hồ sơ cá nhân (mọi vai trò). Đăng xuất nằm ở menu avatar X07. */
export default async function ProfilePage() {
  const pc = await getPageContext();
  return (
    <ProfileForm
      initial={{
        fullName: pc.user.fullName ?? '',
        email: pc.user.email,
        locale: pc.user.locale === 'en' ? 'en' : 'vi',
      }}
    />
  );
}
