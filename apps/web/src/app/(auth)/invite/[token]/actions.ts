'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { acceptInvitation, peekInvitation, upsertUser, userExistsByEmail } from '@adxlens/core/tenancy';
import { getAuthUser } from '@/server/auth';
import { MIN_PASSWORD } from '@/server/auth-flows';
import { deps } from '@/server/deps';
import { WORKSPACE_COOKIE } from '@/server/route';
import { supabaseAdmin, supabaseServer } from '@/server/supabase';

export type InviteState = { status: 'idle' } | { status: 'error'; code: 'invalid' | 'weak_password' | 'failed' };

async function finish(workspaceId: string): Promise<never> {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 31536000,
  });
  redirect('/w');
}

/** Người đã đăng nhập đúng email: chấp nhận ngay. */
export async function acceptAsCurrentUser(token: string): Promise<InviteState> {
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const { db } = deps();
  await upsertUser(db, { id: user.id, email: user.email });
  const r = await acceptInvitation(db, { token, userId: user.id, email: user.email }).catch(() => null);
  if (!r) return { status: 'error', code: 'invalid' };
  return finish(r.workspaceId);
}

const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(MIN_PASSWORD).max(128),
});

/**
 * Người mới: tạo tài khoản với email được mời (đã chứng minh sở hữu email qua link mời nên đánh dấu
 * đã xác minh), đăng nhập, rồi chấp nhận lời mời.
 */
export async function registerAndAccept(token: string, _: InviteState, fd: FormData): Promise<InviteState> {
  const { db } = deps();
  const inv = await peekInvitation(db, token);
  if (inv.status !== 'valid') return { status: 'error', code: 'invalid' };
  if (await userExistsByEmail(db, inv.email)) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const parsed = registerSchema.safeParse({ fullName: fd.get('fullName'), password: fd.get('password') });
  if (!parsed.success) return { status: 'error', code: 'weak_password' };

  const admin = supabaseAdmin();
  const created = await admin.auth.admin.createUser({
    email: inv.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (created.error || !created.data.user) return { status: 'error', code: 'failed' };
  const sb = await supabaseServer();
  await sb.auth.signInWithPassword({ email: inv.email, password: parsed.data.password });
  await upsertUser(db, { id: created.data.user.id, email: inv.email, fullName: parsed.data.fullName });
  const r = await acceptInvitation(db, { token, userId: created.data.user.id, email: inv.email }).catch(() => null);
  if (!r) return { status: 'error', code: 'invalid' };
  return finish(r.workspaceId);
}
