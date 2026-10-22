import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, notFound, type ActorCtx } from '@adxlens/core/shared';
import { assertCan, assertClientAccess, canAccessClient } from './permissions';

const { clients } = schema;

export type ClientInput = {
  name: string;
  reportLocale?: 'vi' | 'en' | null;
  brandOverride?: schema.WorkspaceBrand | null;
};

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new AppError('VALIDATION_FAILED', 'Tên Client không được trống');
  if (n.length > 120) throw new AppError('VALIDATION_FAILED', 'Tên Client tối đa 120 ký tự');
  return n;
}

/** Danh sách Client mà actor được thấy (buyer chỉ thấy Client được gán). */
export async function listClients(ctx: ActorCtx, opts: { includeArchived?: boolean } = {}) {
  const conds = [eq(clients.workspaceId, ctx.workspaceId)];
  if (!opts.includeArchived) conds.push(isNull(clients.archivedAt));
  if (ctx.actor.role !== 'owner' && ctx.actor.clientAccess.length > 0) {
    conds.push(inArray(clients.id, ctx.actor.clientAccess));
  } else if (ctx.actor.role === 'buyer') {
    return [];
  }
  return ctx.db
    .select()
    .from(clients)
    .where(and(...conds))
    .orderBy(asc(clients.name));
}

export async function getClient(ctx: ActorCtx, clientId: string) {
  const [c] = await ctx.db
    .select()
    .from(clients)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, clientId)));
  if (!c || !canAccessClient(ctx.actor, c.id)) throw notFound('Client');
  return c;
}

export async function createClient(ctx: ActorCtx, input: ClientInput) {
  assertCan(ctx.actor, 'clients.manage');
  const [c] = await ctx.db
    .insert(clients)
    .values({
      workspaceId: ctx.workspaceId,
      name: cleanName(input.name),
      reportLocale: input.reportLocale ?? null,
      brandOverride: input.brandOverride ?? null,
    })
    .returning();
  if (!c) throw new AppError('INTERNAL', 'Không tạo được Client');
  return c;
}

export async function updateClient(ctx: ActorCtx, clientId: string, input: Partial<ClientInput>) {
  assertCan(ctx.actor, 'clients.manage');
  assertClientAccess(ctx.actor, clientId);
  const patch: Partial<typeof clients.$inferInsert> = {};
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.reportLocale !== undefined) patch.reportLocale = input.reportLocale;
  if (input.brandOverride !== undefined) patch.brandOverride = input.brandOverride;
  const [c] = await ctx.db
    .update(clients)
    .set(patch)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, clientId)))
    .returning();
  if (!c) throw notFound('Client');
  return c;
}

/** Lưu trữ thay vì xóa cứng: báo cáo và lịch sử của Client vẫn còn. */
export async function archiveClient(ctx: ActorCtx, clientId: string): Promise<void> {
  assertCan(ctx.actor, 'clients.manage');
  assertClientAccess(ctx.actor, clientId);
  const res = await ctx.db
    .update(clients)
    .set({ archivedAt: new Date() })
    .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, clientId)))
    .returning({ id: clients.id });
  if (!res.length) throw notFound('Client');
}
