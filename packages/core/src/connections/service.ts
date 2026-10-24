import { and, asc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import type { MetaAdAccount } from '@adxlens/meta-client';
import { AppError, notFound, systemClock, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan, canAccessClient } from '@adxlens/core/tenancy';
import { decryptToken, encryptToken, type TokenKeys } from './crypto';

const { metaConnections, metaAvailableAccounts, adAccounts, clients, jobAudit } = schema;

/** Trường an toàn để trả ra ngoài: tuyệt đối không có token (CLAUDE.md quy tắc 2). */
const PUBLIC_CONNECTION_FIELDS = {
  id: metaConnections.id,
  metaUserId: metaConnections.metaUserId,
  metaUserName: metaConnections.metaUserName,
  scopes: metaConnections.scopes,
  status: metaConnections.status,
  isDemo: metaConnections.isDemo,
  expiresAt: metaConnections.expiresAt,
  createdBy: metaConnections.createdBy,
  createdAt: metaConnections.createdAt,
};

export type SaveConnectionInput = {
  token: string;
  expiresAt: Date | null;
  scopes: string[];
  metaUser: { id: string; name?: string };
  accounts: MetaAdAccount[];
};

/**
 * Lưu kết nối sau OAuth: mã hóa token, cùng tài khoản Meta trong cùng workspace thì cập nhật kết
 * nối cũ (kết nối lại sau khi hết hạn). Lưu danh sách tài khoản QC truy cập được cho S04.
 */
export async function saveConnection(
  ctx: ActorCtx,
  input: SaveConnectionInput,
  keys: { keys: TokenKeys; current: number },
): Promise<{ connectionId: string; reconnected: boolean }> {
  assertCan(ctx.actor, 'connections.manage');
  const key = keys.keys[keys.current];
  if (!key) throw new AppError('INTERNAL', 'Thiếu khóa mã hóa token');
  const ciphertext = encryptToken(input.token, key);
  const [existing] = await ctx.db
    .select({ id: metaConnections.id })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.metaUserId, input.metaUser.id)));
  let connectionId: string;
  if (existing) {
    await ctx.db
      .update(metaConnections)
      .set({
        tokenCiphertext: ciphertext,
        tokenKeyVersion: keys.current,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        status: 'active',
        metaUserName: input.metaUser.name ?? null,
        lastRefreshedAt: new Date(),
      })
      .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, existing.id)));
    connectionId = existing.id;
  } else {
    const [row] = await ctx.db
      .insert(metaConnections)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.actor.userId,
        metaUserId: input.metaUser.id,
        metaUserName: input.metaUser.name ?? null,
        tokenCiphertext: ciphertext,
        tokenKeyVersion: keys.current,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      })
      .returning({ id: metaConnections.id });
    connectionId = row!.id;
  }
  await replaceAvailableAccounts(ctx, connectionId, input.accounts);
  // Kết nối lại: tài khoản đã nhập nhưng mất quyền trước đó được đánh dấu chờ đồng bộ lại.
  await ctx.db
    .update(adAccounts)
    .set({ syncStatus: 'pending' })
    .where(
      and(
        eq(adAccounts.workspaceId, ctx.workspaceId),
        eq(adAccounts.connectionId, connectionId),
        eq(adAccounts.syncStatus, 'no_access'),
        inArray(
          adAccounts.metaAccountId,
          input.accounts.map((a) => a.id),
        ),
      ),
    );
  return { connectionId, reconnected: Boolean(existing) };
}

async function replaceAvailableAccounts(ctx: WorkspaceCtx, connectionId: string, accounts: MetaAdAccount[]) {
  await ctx.db
    .delete(metaAvailableAccounts)
    .where(
      and(eq(metaAvailableAccounts.workspaceId, ctx.workspaceId), eq(metaAvailableAccounts.connectionId, connectionId)),
    );
  if (!accounts.length) return;
  await ctx.db.insert(metaAvailableAccounts).values(
    accounts.map((a) => ({
      workspaceId: ctx.workspaceId,
      connectionId,
      metaAccountId: a.id,
      name: a.name || a.id,
      currency: a.currency,
      timezone: a.timezone_name,
      accountStatus: a.account_status ?? null,
    })),
  );
}

export async function listConnections(ctx: ActorCtx) {
  assertCan(ctx.actor, 'connections.manage');
  return ctx.db
    .select(PUBLIC_CONNECTION_FIELDS)
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, ctx.workspaceId))
    .orderBy(asc(metaConnections.createdAt));
}

export async function getConnection(ctx: ActorCtx, connectionId: string) {
  assertCan(ctx.actor, 'connections.manage');
  const [c] = await ctx.db
    .select(PUBLIC_CONNECTION_FIELDS)
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  if (!c) throw notFound('Kết nối');
  return c;
}

/** S04: tài khoản QC truy cập được qua kết nối, kèm đã nhập hay chưa. */
export async function listAvailableAccounts(ctx: ActorCtx, connectionId: string) {
  await getConnection(ctx, connectionId);
  const avail = await ctx.db
    .select()
    .from(metaAvailableAccounts)
    .where(
      and(eq(metaAvailableAccounts.workspaceId, ctx.workspaceId), eq(metaAvailableAccounts.connectionId, connectionId)),
    )
    .orderBy(asc(metaAvailableAccounts.name));
  const imported = new Set(
    (
      await ctx.db
        .select({ m: adAccounts.metaAccountId })
        .from(adAccounts)
        .where(eq(adAccounts.workspaceId, ctx.workspaceId))
    ).map((r) => r.m),
  );
  return avail.map((a) => ({
    metaAccountId: a.metaAccountId,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    accountStatus: a.accountStatus,
    spend30d: a.spend30d,
    spendChecked: a.spendCheckedAt !== null,
    imported: imported.has(a.metaAccountId),
  }));
}

/** Gợi ý Client theo tên: trùng hoặc tên tài khoản bắt đầu bằng tên Client (không phân biệt hoa thường). */
export function suggestClient(accountName: string, existing: { id: string; name: string }[]) {
  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();
  const n = norm(accountName);
  const hit = existing
    .filter((c) => n === norm(c.name) || n.startsWith(`${norm(c.name)} `) || n.startsWith(`${norm(c.name)}-`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (hit) return { id: hit.id, name: hit.name };
  // Bỏ hậu tố thường gặp "- Main", "| VN", "(2)".
  const base = accountName.replace(/\s*[-|·(].*$/, '').trim() || accountName;
  return { id: null, name: base };
}

/** POST /ad-accounts/import (L3 10.2): nhập tài khoản đã chọn, trạng thái gán "suggested". */
export async function importAccounts(ctx: ActorCtx, input: { connectionId: string; metaAccountIds: string[] }) {
  assertCan(ctx.actor, 'connections.manage');
  const available = await listAvailableAccounts(ctx, input.connectionId);
  const chosen = available.filter((a) => input.metaAccountIds.includes(a.metaAccountId));
  if (chosen.length !== new Set(input.metaAccountIds).size) {
    throw new AppError('VALIDATION_FAILED', 'Có tài khoản không thuộc kết nối này');
  }
  const existingClients = await ctx.db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), isNull(clients.archivedAt)));
  const out = [];
  for (const a of chosen) {
    const s = suggestClient(a.name, existingClients);
    const [row] = await ctx.db
      .insert(adAccounts)
      .values({
        workspaceId: ctx.workspaceId,
        connectionId: input.connectionId,
        clientId: s.id,
        suggestedClientName: s.id ? null : s.name,
        metaAccountId: a.metaAccountId,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone,
      })
      .onConflictDoUpdate({
        target: [adAccounts.workspaceId, adAccounts.metaAccountId],
        set: { connectionId: input.connectionId, name: a.name },
      })
      .returning();
    out.push({
      adAccountId: row!.id,
      metaAccountId: row!.metaAccountId,
      name: row!.name,
      currency: row!.currency,
      timezone: row!.timezone,
      suggestedClient: { id: s.id, name: s.name },
      assignmentStatus: row!.assignmentStatus,
    });
  }
  return out;
}

/**
 * Danh sách tài khoản QC đã nhập; buyer chỉ thấy tài khoản của Client được gán. Mặc định bỏ tài khoản của kết nối
 * đã ngắt (`revoked`, dữ liệu đang chờ xóa) — chúng không được gán, đồng bộ hay báo cáo nữa. `includeRevoked` chỉ cho
 * nơi cần tên tài khoản của lịch sử (nhật ký hành động, breaker).
 */
export async function listAdAccounts(ctx: ActorCtx, opts: { clientId?: string; includeRevoked?: boolean } = {}) {
  const rows = await ctx.db
    .select({
      id: adAccounts.id,
      metaAccountId: adAccounts.metaAccountId,
      name: adAccounts.name,
      currency: adAccounts.currency,
      timezone: adAccounts.timezone,
      clientId: adAccounts.clientId,
      clientName: clients.name,
      suggestedClientName: adAccounts.suggestedClientName,
      assignmentStatus: adAccounts.assignmentStatus,
      syncStatus: adAccounts.syncStatus,
      lastSyncedAt: adAccounts.lastSyncedAt,
      active30d: adAccounts.active30d,
      connectionId: adAccounts.connectionId,
      connectionStatus: metaConnections.status,
      isDemo: metaConnections.isDemo,
    })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .leftJoin(clients, eq(clients.id, adAccounts.clientId))
    .where(
      and(
        eq(adAccounts.workspaceId, ctx.workspaceId),
        opts.clientId ? eq(adAccounts.clientId, opts.clientId) : undefined,
        opts.includeRevoked ? undefined : ne(metaConnections.status, 'revoked'),
      ),
    )
    .orderBy(asc(adAccounts.name));
  return rows.filter((r) =>
    ctx.actor.role === 'owner' || (ctx.actor.role === 'manager' && ctx.actor.clientAccess.length === 0)
      ? true
      : r.clientId !== null && canAccessClient(ctx.actor, r.clientId),
  );
}

/** Kết nối hết hạn hoặc sắp hết hạn trong 7 ngày (banner X04, playbook token_expiring). */
export async function connectionHealth(ctx: WorkspaceCtx, clock: Clock = systemClock) {
  const soon = new Date(clock.now().getTime() + 7 * 86_400_000);
  const rows = await ctx.db
    .select({
      id: metaConnections.id,
      status: metaConnections.status,
      expiresAt: metaConnections.expiresAt,
      name: metaConnections.metaUserName,
    })
    .from(metaConnections)
    .where(
      and(
        eq(metaConnections.workspaceId, ctx.workspaceId),
        or(
          eq(metaConnections.status, 'expired'),
          and(eq(metaConnections.status, 'active'), lte(metaConnections.expiresAt, soon)),
        ),
      ),
    );
  return {
    expired: rows.filter((r) => r.status === 'expired'),
    expiringSoon: rows.filter((r) => r.status === 'active'),
  };
}

export async function markConnectionExpired(ctx: WorkspaceCtx, connectionId: string): Promise<void> {
  await ctx.db
    .update(metaConnections)
    .set({ status: 'expired' })
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
}

/**
 * CHỈ DÙNG TRONG WORKER (CLAUDE.md quy tắc 2): giải mã token, gọi `fn`, không trả token ra ngoài.
 * `scripts/check-boundaries.mjs` chặn apps/web import hàm này.
 */
export async function withConnectionToken<T>(
  ctx: WorkspaceCtx,
  connectionId: string,
  keys: TokenKeys,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const [c] = await ctx.db
    .select({
      ciphertext: metaConnections.tokenCiphertext,
      version: metaConnections.tokenKeyVersion,
      status: metaConnections.status,
    })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  if (!c) throw notFound('Kết nối');
  if (c.status !== 'active') throw new AppError('CONFLICT', 'Kết nối không còn hiệu lực', { status: c.status });
  const key = keys[c.version];
  if (!key) throw new AppError('INTERNAL', 'Thiếu khóa giải mã token', { version: c.version });
  return fn(decryptToken(c.ciphertext, key));
}

/** Ghi một lời gọi Meta vào job_audit (L3 6.2). */
export async function recordMetaCall(
  db: DbOrTx,
  workspaceId: string | null,
  a: {
    endpoint: string;
    account: string | null;
    durationMs: number;
    status: number;
    errorCode: number | null;
    attempt: number;
  },
  jobId?: string,
): Promise<void> {
  await db.insert(jobAudit).values({
    workspaceId,
    jobId: jobId ?? null,
    endpoint: a.endpoint,
    metaAccountId: a.account,
    durationMs: a.durationMs,
    status: a.status,
    errorCode: a.errorCode,
    attempt: a.attempt,
  });
}
