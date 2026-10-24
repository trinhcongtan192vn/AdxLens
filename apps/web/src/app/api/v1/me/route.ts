import { getUser, listWorkspacesForUser } from '@adxlens/core/tenancy';
import { route } from '@/server/route';

/** Hồ sơ người dùng hiện tại và danh sách workspace (vai trò trong từng workspace). */
export const GET = route({
  auth: 'user',
  handler: async ({ db, user }) => {
    const profile = await getUser(db, user.id);
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.fullName ?? null,
      locale: profile?.locale ?? 'vi',
      workspaces: await listWorkspacesForUser(db, user.id),
    };
  },
});
