import { desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';

const { workspaces, featureFlags } = schema;

/**
 * AD01 ma trận workspace × cờ cho đội AdxLens (staff). Truy vấn XUYÊN WORKSPACE có chủ đích (CLAUDE.md
 * quy tắc 1): trang nội bộ, chỉ route `auth: 'staff'` gọi. Chỉ trả thông tin vận hành, không trả số liệu
 * quảng cáo.
 */
export async function adminWorkspaceMatrix(db: DbOrTx, opts: { q?: string; limit?: number } = {}) {
  const q = opts.q?.trim();
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
      // Tham chiếu cột ngoài phải ghi đủ "app"."workspaces"."id" (drizzle render cột không kèm bảng).
      ownerEmail: sql<string | null>`(select u.email from app.memberships m join app.users u on u.id = m.user_id
        where m.workspace_id = "app"."workspaces"."id" and m.role = 'owner' limit 1)`,
      accounts: sql<number>`(select count(*)::int from app.ad_accounts a where a.workspace_id = "app"."workspaces"."id")`,
    })
    .from(workspaces)
    .where(q ? sql`${workspaces.name} ilike ${`%${q}%`}` : undefined)
    .orderBy(desc(workspaces.createdAt))
    .limit(opts.limit ?? 200);
  const flags = rows.length
    ? await db
        .select({
          workspaceId: featureFlags.workspaceId,
          key: featureFlags.flagKey,
          enabled: featureFlags.enabled,
          enabledAt: featureFlags.enabledAt,
        })
        .from(featureFlags)
        .where(sql`${featureFlags.workspaceId} in ${rows.map((r) => r.id)}`)
    : [];
  return rows.map((r) => ({
    ...r,
    flags: Object.fromEntries(
      flags.filter((f) => f.workspaceId === r.id).map((f) => [f.key, { enabled: f.enabled, enabledAt: f.enabledAt }]),
    ) as Partial<Record<(typeof schema.FLAG_KEYS)[number], { enabled: boolean; enabledAt: Date | null }>>,
  }));
}

export async function adminWorkspaceName(db: DbOrTx, workspaceId: string) {
  const [w] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return w?.name ?? null;
}
