import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { AppError, type ActorCtx } from '@adxlens/core/shared';

const { entities } = schema;

/**
 * Nguồn cho Ad / Audience Launcher (ADR-0023): nhóm QC đang chạy / tạm dừng và custom audience của một tài khoản QC
 * người dùng được xem (đọc snapshot, không gọi Meta).
 */
export async function launcherSources(ctx: ActorCtx, adAccountId: string) {
  if (!(await listAdAccounts(ctx)).some((a) => a.id === adAccountId)) throw new AppError('NOT_FOUND', 'Không tìm thấy');
  const rows = await ctx.db
    .select({
      type: entities.entityType,
      metaId: entities.metaId,
      name: entities.name,
      status: entities.status,
      parent: entities.parentMetaId,
      attrs: entities.attrs,
    })
    .from(entities)
    .where(
      and(
        eq(entities.workspaceId, ctx.workspaceId),
        eq(entities.adAccountId, adAccountId),
        inArray(entities.entityType, ['campaign', 'adset', 'audience']),
      ),
    );
  const campaigns = new Map(rows.filter((r) => r.type === 'campaign').map((r) => [r.metaId, r.name]));
  return {
    adsets: rows
      .filter((r) => r.type === 'adset' && (r.status === 'ACTIVE' || r.status === 'PAUSED'))
      .map((r) => ({
        metaId: r.metaId,
        name: r.name,
        status: r.status,
        campaignName: campaigns.get(r.parent ?? '') ?? null,
      }))
      .sort((a, b) =>
        a.status === b.status ? (a.name ?? '').localeCompare(b.name ?? '') : a.status === 'ACTIVE' ? -1 : 1,
      ),
    audiences: rows
      .filter((r) => r.type === 'audience')
      .map((r) => ({
        metaId: r.metaId,
        name: r.name,
        subtype: (r.attrs as { subtype?: string | null }).subtype ?? null,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
  };
}
