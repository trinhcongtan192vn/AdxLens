import 'server-only';
import type { DbOrTx } from '@adxlens/db';
import { invitationEmail, type EmailSender } from '@adxlens/core/notification';
import { getUser, getWorkspace, INVITATION_TTL_DAYS } from '@adxlens/core/tenancy';

/** Gửi email mời (E02) với link /invite/<token>. Token chỉ nằm trong email, không lưu, không log. */
export async function sendInvitationEmail(
  deps: { db: DbOrTx; email: EmailSender },
  input: {
    workspaceId: string;
    inviterUserId: string;
    to: string;
    role: 'manager' | 'buyer';
    token: string;
    /** Gốc URL công khai (`appBaseUrl(ctx.req)`). */
    appUrl: string;
  },
): Promise<void> {
  const ws = await getWorkspace({ db: deps.db, workspaceId: input.workspaceId });
  const inviter = await getUser(deps.db, input.inviterUserId);
  await deps.email.send(
    invitationEmail({
      locale: ws.defaultLocale === 'en' ? 'en' : 'vi',
      to: input.to,
      workspaceName: ws.name,
      inviterName: inviter?.fullName ?? inviter?.email ?? ws.name,
      role: input.role,
      link: `${input.appUrl}/invite/${encodeURIComponent(input.token)}`,
      days: INVITATION_TTL_DAYS,
    }),
  );
}
