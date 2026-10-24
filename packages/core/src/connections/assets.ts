import { and, asc, eq, lt } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { MetaApiError, type MetaReadApi } from '@adxlens/meta-client';
import { systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';

const { metaAssets } = schema;
export type MetaAssetKind = (typeof schema.META_ASSET_KINDS)[number];

type AssetRow = {
  kind: MetaAssetKind;
  metaId: string;
  name: string;
  parentId: string | null;
  attrs: Record<string, string | null>;
};

/**
 * Đọc một nhóm tài sản; thiếu quyền (người dùng bỏ chọn trong hộp thoại Meta) → bỏ qua nhóm đó, không làm hỏng việc làm
 * mới tài khoản. Token hết hạn thì ném tiếp để nơi gọi đánh dấu kết nối hết hạn.
 */
async function tryList<T>(fn: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MetaApiError && e.isTokenInvalid) throw e;
    return null;
  }
}

/**
 * ADR-0016: làm mới danh sách Page / Instagram / Pixel / Catalog của kết nối. Chỉ chạy trong worker (token đã giải mã
 * do `withConnectionToken` cấp). Tài sản không còn thấy ở lần này bị xóa, trừ nhóm đọc lỗi (giữ dữ liệu cũ).
 */
export async function refreshAssets(
  ctx: WorkspaceCtx,
  connectionId: string,
  token: string,
  accountIds: string[],
  deps: { meta: MetaReadApi; clock?: Clock },
): Promise<Record<MetaAssetKind, number | null>> {
  const now = (deps.clock ?? systemClock).now();
  const groups: Record<MetaAssetKind, AssetRow[] | null> = { page: null, instagram: null, pixel: null, catalog: null };

  const pages = await tryList(() => deps.meta.listPages(token));
  if (pages) {
    groups.page = pages.map((p) => ({
      kind: 'page',
      metaId: p.id,
      name: p.name || p.id,
      parentId: null,
      attrs: { category: p.category ?? null },
    }));
    groups.instagram = pages.flatMap((p) =>
      p.instagram_business_account
        ? [
            {
              kind: 'instagram' as const,
              metaId: p.instagram_business_account.id,
              name: p.instagram_business_account.username ?? p.instagram_business_account.id,
              parentId: p.id,
              attrs: {},
            },
          ]
        : [],
    );
  }

  const pixels: AssetRow[] = [];
  let pixelsOk = accountIds.length > 0;
  for (const act of accountIds) {
    const list = await tryList(() => deps.meta.listPixels(token, act));
    if (!list) {
      pixelsOk = false;
      continue;
    }
    for (const p of list) {
      if (!pixels.some((x) => x.metaId === p.id)) {
        pixels.push({
          kind: 'pixel',
          metaId: p.id,
          name: p.name || p.id,
          parentId: act,
          attrs: { lastFiredTime: p.last_fired_time ?? null },
        });
      }
    }
  }
  if (pixelsOk || pixels.length) groups.pixel = pixels;

  const businesses = await tryList(() => deps.meta.listBusinesses(token));
  if (businesses) {
    groups.catalog = businesses.flatMap((b) =>
      (b.owned_product_catalogs?.data ?? []).map((c) => ({
        kind: 'catalog' as const,
        metaId: c.id,
        name: c.name || c.id,
        parentId: b.id,
        attrs: { business: b.name || null },
      })),
    );
  }

  const counts = { page: null, instagram: null, pixel: null, catalog: null } as Record<MetaAssetKind, number | null>;
  for (const kind of Object.keys(groups) as MetaAssetKind[]) {
    const rows = groups[kind];
    if (!rows) continue;
    for (const r of rows) {
      await ctx.db
        .insert(metaAssets)
        .values({ workspaceId: ctx.workspaceId, connectionId, ...r, seenAt: now })
        .onConflictDoUpdate({
          target: [metaAssets.connectionId, metaAssets.kind, metaAssets.metaId],
          set: { name: r.name, parentId: r.parentId, attrs: r.attrs, seenAt: now },
        });
    }
    await ctx.db
      .delete(metaAssets)
      .where(
        and(
          eq(metaAssets.workspaceId, ctx.workspaceId),
          eq(metaAssets.connectionId, connectionId),
          eq(metaAssets.kind, kind),
          lt(metaAssets.seenAt, now),
        ),
      );
    counts[kind] = rows.length;
  }
  return counts;
}

export type MetaAsset = {
  kind: MetaAssetKind;
  metaId: string;
  name: string;
  parentId: string | null;
  attrs: Record<string, string | null>;
};

/** Tài sản của workspace (mọi kết nối), gộp trùng theo `kind` + `metaId`. */
export async function listAssets(ctx: WorkspaceCtx, kind?: MetaAssetKind): Promise<MetaAsset[]> {
  const rows = await ctx.db
    .select({
      kind: metaAssets.kind,
      metaId: metaAssets.metaId,
      name: metaAssets.name,
      parentId: metaAssets.parentId,
      attrs: metaAssets.attrs,
    })
    .from(metaAssets)
    .where(and(eq(metaAssets.workspaceId, ctx.workspaceId), kind ? eq(metaAssets.kind, kind) : undefined))
    .orderBy(asc(metaAssets.kind), asc(metaAssets.name));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.kind}:${r.metaId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
