import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getFlags, type FlagKey } from '@adxlens/core/flags';
import type { Actor, ActorCtx } from '@adxlens/core/shared';
import {
  getUser,
  isStaff,
  listWorkspacesForUser,
  resolveActor,
  upsertUser,
  type StaffInfo,
  type WorkspaceSummary,
} from '@adxlens/core/tenancy';
import { getAuthUser, type AuthUser } from './auth';
import { deps } from './deps';
import { WORKSPACE_COOKIE } from './route';

export type PageContext = {
  user: AuthUser & { fullName: string | null; locale: string };
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary;
  actor: Actor;
  flags: Record<FlagKey, boolean>;
  staff: StaffInfo | null;
  /** Ngữ cảnh gọi core (đã kiểm thành viên). */
  ctx: ActorCtx;
};

/** User đã đăng nhập hoặc chuyển về /login. Đồng bộ hồ sơ vào app.users. */
export const requireUser = cache(async (next?: string) => {
  const user = await getAuthUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  if (!user.emailConfirmed) redirect('/verify-email');
  const { db } = deps();
  let profile = await getUser(db, user.id);
  if (!profile) {
    await upsertUser(db, { id: user.id, email: user.email });
    profile = await getUser(db, user.id);
  }
  return { ...user, fullName: profile?.fullName ?? null, locale: profile?.locale ?? 'vi' };
});

/**
 * Ngữ cảnh cho mọi trang app: user, workspace hiện tại (cookie `ws`, mặc định workspace đầu tiên),
 * actor đã kiểm thành viên, cờ. Chưa có workspace → tạo workspace (A07).
 */
export const getPageContext = cache(async (): Promise<PageContext> => {
  const user = await requireUser();
  const { db } = deps();
  const workspaces = await listWorkspacesForUser(db, user.id);
  if (workspaces.length === 0) redirect('/onboarding/workspace');
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === wanted) ?? workspaces[0]!;
  const actor = await resolveActor(db, workspace.id, user.id);
  if (!actor) redirect('/forbidden');
  const flags = await getFlags({ db, workspaceId: workspace.id });
  const staff = await isStaff(db, user.id);
  return {
    user,
    workspaces,
    workspace,
    actor,
    flags,
    staff,
    ctx: { db, workspaceId: workspace.id, actor },
  };
});

/** Trang P1/P2: cờ tắt thì trả trang "tính năng chưa bật" (F-state, ux-requirements EC15). */
export async function requireFlag(pc: PageContext, flag: FlagKey): Promise<void> {
  if (!pc.flags[flag]) redirect('/feature-unavailable');
}
