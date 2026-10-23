import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import type { MetaReadApi } from '@adxlens/meta-client';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import type { ActorCtx, WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan, createClient } from '@adxlens/core/tenancy';
import { assignAdAccount } from './assignment';
import { importAccounts, saveConnection } from './service';

const { metaConnections, clients } = schema;

/** Tài khoản mẫu: một tài khoản khớp số liệu, một tài khoản có ngày lệch (để thấy luồng đối chiếu). */
export const DEMO_ACCOUNTS = [
  { act: 'act_100000001', client: 'Khách mẫu · Cà phê' },
  { act: 'act_100000002', client: 'Khách mẫu · Thời trang' },
] as const;

let demoMeta: MetaReadApi | null = null;

/**
 * Kết nối mẫu (S01) luôn đọc dữ liệu giả, dù môi trường dùng Meta thật — không bao giờ gọi Meta bằng kết nối
 * mẫu. Kết nối thật dùng `real`.
 */
export function metaFor(connection: { isDemo: boolean }, real: MetaReadApi): MetaReadApi {
  if (!connection.isDemo) return real;
  demoMeta ??= new MockMetaRead();
  return demoMeta;
}

export async function demoConnection(ctx: WorkspaceCtx) {
  const [c] = await ctx.db
    .select({ id: metaConnections.id })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.isDemo, true)));
  return c ?? null;
}

/**
 * S01 "Dùng tài khoản mẫu" (PRD P0-02): tạo kết nối mẫu + 2 tài khoản QC + 2 Client mẫu đã xác nhận, bắt
 * đầu backfill (dữ liệu giả). Đã có thì trả lại kết nối cũ.
 */
export async function startDemo(
  ctx: ActorCtx,
  deps: {
    keys: Parameters<typeof saveConnection>[2];
    enqueue: Enqueue;
    startBackfill: (adAccountId: string) => Promise<unknown>;
  },
): Promise<{ connectionId: string; created: boolean }> {
  assertCan(ctx.actor, 'connections.manage');
  const existing = await demoConnection(ctx);
  if (existing) return { connectionId: existing.id, created: false };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'demo-read-only',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `demo-${ctx.workspaceId}`, name: 'Dữ liệu mẫu' },
      accounts: MOCK_ACCOUNTS.filter((a) => DEMO_ACCOUNTS.some((d) => d.act === a.id)),
    },
    deps.keys,
  );
  await ctx.db
    .update(metaConnections)
    .set({ isDemo: true })
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  const imported = await importAccounts(ctx, { connectionId, metaAccountIds: DEMO_ACCOUNTS.map((d) => d.act) });
  for (const d of DEMO_ACCOUNTS) {
    const acc = imported.find((i) => i.metaAccountId === d.act)!;
    const client = await createClient(ctx, { name: d.client });
    await ctx.db
      .update(clients)
      .set({ isDemo: true })
      .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, client.id)));
    await assignAdAccount(ctx, acc.adAccountId, { clientId: client.id });
    await deps.startBackfill(acc.adAccountId);
  }
  return { connectionId, created: true };
}

/** "Xóa dữ liệu mẫu": xóa kết nối mẫu (cascade tài khoản + số liệu) và Client mẫu. */
export async function removeDemo(ctx: ActorCtx): Promise<boolean> {
  assertCan(ctx.actor, 'connections.manage');
  const c = await demoConnection(ctx);
  if (!c) return false;
  await ctx.db
    .delete(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, c.id)));
  const demoClients = await ctx.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.isDemo, true)));
  if (demoClients.length) {
    await ctx.db.delete(clients).where(
      and(
        eq(clients.workspaceId, ctx.workspaceId),
        inArray(
          clients.id,
          demoClients.map((x) => x.id),
        ),
      ),
    );
  }
  return true;
}

/** Kết nối có phải kết nối mẫu không (để chọn nguồn dữ liệu giả). */
export async function connectionIsDemo(ctx: WorkspaceCtx, connectionId: string): Promise<boolean> {
  const [c] = await ctx.db
    .select({ isDemo: metaConnections.isDemo })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  return c?.isDemo ?? false;
}
