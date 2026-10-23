import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { peekInvitation, userExistsByEmail } from '@adxlens/core/tenancy';
import { Badge, buttonVariants } from '@adxlens/ui';
import { AuthHeading } from '@/components/auth-form';
import { getAuthUser } from '@/server/auth';
import { deps } from '@/server/deps';
import { AcceptInvite } from './accept';

export async function generateMetadata() {
  const t = await getTranslations('invite');
  return { title: t('metaTitle') };
}

/** A06 Chấp nhận lời mời (và A06 · hết hạn). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('invite');
  const { db } = deps();
  const inv = await peekInvitation(db, token);

  if (inv.status !== 'valid') {
    return (
      <div className="flex flex-col gap-3">
        <Badge tone="warning" className="self-start">
          {t('expiredBadge')}
        </Badge>
        <h1 className="text-h2 font-semibold text-fg">
          {t(inv.status === 'expired' ? 'expiredTitle' : 'invalidTitle')}
        </h1>
        <p className="text-body text-fg-secondary">
          {inv.status === 'expired' ? t('expiredBody', { workspace: inv.workspaceName }) : t('invalidBody')}
        </p>
        <Link href="/login" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {t('toLogin')}
        </Link>
      </div>
    );
  }

  const user = await getAuthUser();
  const hasAccount = await userExistsByEmail(db, inv.email);
  const mode = user ? (user.email === inv.email ? 'accept' : 'wrongAccount') : hasAccount ? 'login' : 'register';
  const roleLabel = t(`roles.${inv.role}`);
  return (
    <div>
      <AuthHeading
        title={t('title', { workspace: inv.workspaceName })}
        description={
          inv.inviterName
            ? t('invitedBy', {
                name: inv.inviterName,
                inviterRole: inv.inviterRole ? t(`roles.${inv.inviterRole}`) : '',
                role: roleLabel,
              })
            : t('invitedAs', { role: roleLabel })
        }
      />
      <div className="mb-4 rounded-md border border-line bg-canvas px-3 py-2">
        <p className="text-body font-medium text-fg">
          {inv.allClients
            ? t('allClients')
            : inv.clientNames.length
              ? t('clientsCount', { count: inv.clientNames.length })
              : t('noClients')}
        </p>
        {!inv.allClients && inv.clientNames.length ? (
          <p className="text-small text-fg-secondary">{inv.clientNames.join(', ')}</p>
        ) : null}
      </div>
      <AcceptInvite token={token} mode={mode} email={inv.email} />
      <p className="mt-3 text-small text-fg-tertiary">{t('validity', { email: inv.email, days: inv.daysLeft })}</p>
    </div>
  );
}
