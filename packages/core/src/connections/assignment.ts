import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, notFound, type ActorCtx } from '@adxlens/core/shared';
import { archiveClient, assertCan, assertClientAccess, createClient, listClients } from '@adxlens/core/tenancy';
import { listAdAccounts } from './service';

const { adAccounts, clients } = schema;

async function getAccount(ctx: ActorCtx, adAccountId: string) {
  const [a] = await ctx.db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!a) throw notFound('Tài khoản QC');
  return a;
}

/**
 * Gán tài khoản QC cho Client và XÁC NHẬN (L3 10.2, PRD 7.3). Đã xác nhận cho Client khác → 409, phải
 * bỏ gán trước. `createClientName` tạo Client mới khi chưa có.
 */
export async function assignAdAccount(
  ctx: ActorCtx,
  adAccountId: string,
  input: { clientId?: string | null; createClientName?: string },
) {
  assertCan(ctx.actor, 'clients.manage');
  const account = await getAccount(ctx, adAccountId);
  let clientId = input.clientId ?? null;
  if (!clientId) {
    if (!input.createClientName?.trim()) throw new AppError('VALIDATION_FAILED', 'Cần chọn hoặc tạo Client');
    clientId = (await createClient(ctx, { name: input.createClientName })).id;
  } else {
    const [c] = await ctx.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, clientId), isNull(clients.archivedAt)));
    if (!c) throw notFound('Client');
    assertClientAccess(ctx.actor, clientId);
  }
  if (account.assignmentStatus === 'confirmed' && account.clientId && account.clientId !== clientId) {
    throw new AppError('CONFLICT', 'Tài khoản đã thuộc Client khác, cần bỏ gán trước', {
      current_client_id: account.clientId,
    });
  }
  const [row] = await ctx.db
    .update(adAccounts)
    .set({ clientId, assignmentStatus: 'confirmed', suggestedClientName: null })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)))
    .returning();
  return row!;
}

/** Bỏ gán: tài khoản về "chưa gán" (suggested), báo cáo của Client cũ không còn tính tài khoản này. */
export async function unassignAdAccount(ctx: ActorCtx, adAccountId: string) {
  assertCan(ctx.actor, 'clients.manage');
  const account = await getAccount(ctx, adAccountId);
  if (account.clientId) assertClientAccess(ctx.actor, account.clientId);
  await ctx.db
    .update(adAccounts)
    .set({ clientId: null, assignmentStatus: 'suggested' })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
}

/** Số tài khoản chưa xác nhận gán (banner C01, BR01). */
export async function unconfirmedCount(ctx: ActorCtx): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.assignmentStatus, 'suggested')));
  return r?.n ?? 0;
}

/** Lưu trữ Client và trả các tài khoản QC của nó về "chưa gán" để gán lại được. */
export async function archiveClientAndRelease(ctx: ActorCtx, clientId: string): Promise<void> {
  await archiveClient(ctx, clientId);
  await ctx.db
    .update(adAccounts)
    .set({ clientId: null, assignmentStatus: 'suggested' })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.clientId, clientId)));
}

export type ClientOverview = {
  id: string;
  name: string;
  accounts: { id: string; name: string; metaAccountId: string; assignmentStatus: string; connectionStatus: string }[];
  createdAt: Date;
};

/** C01: Client actor thấy được, kèm tài khoản QC đã gán. Chỉ số (chi tiêu, health, đối chiếu) thêm ở 012+. */
export async function listClientOverview(ctx: ActorCtx): Promise<ClientOverview[]> {
  const [cs, accounts] = await Promise.all([listClients(ctx), listAdAccounts(ctx)]);
  return cs.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    accounts: accounts
      .filter((a) => a.clientId === c.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        metaAccountId: a.metaAccountId,
        assignmentStatus: a.assignmentStatus,
        connectionStatus: a.connectionStatus,
      })),
  }));
}
