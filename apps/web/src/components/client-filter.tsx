import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listClients } from '@adxlens/core/tenancy';
import type { ActorCtx } from '@adxlens/core/shared';

/** `?client=` hợp lệ (uuid) hoặc undefined. */
export function clientParam(v: string | undefined): string | undefined {
  return v && z.string().uuid().safeParse(v).success ? v : undefined;
}

/** Thêm `client=` vào đường dẫn khi đang lọc theo khách (giữ phạm vi khi đổi bộ lọc khác). */
export function withClient(href: string, clientId: string | undefined): string {
  if (!clientId) return href;
  return `${href}${href.includes('?') ? '&' : '?'}client=${clientId}`;
}

/** G3: chip "Khách: X · Bỏ lọc" ở trang danh sách đang lọc theo một Client. */
export async function ClientFilter({
  ctx,
  clientId,
  clearHref,
}: {
  ctx: ActorCtx;
  clientId?: string;
  clearHref: string;
}) {
  if (!clientId) return null;
  const t = await getTranslations('shell');
  const client = (await listClients(ctx)).find((c) => c.id === clientId);
  return (
    <p className="mb-3 flex items-center gap-2 text-body" data-testid="client-filter">
      <span className="rounded-full border border-brand bg-brand-subtle px-2.5 py-0.5 text-small font-medium text-brand">
        {t('clientFilter', { name: client?.name ?? '—' })}
      </span>
      <Link href={clearHref} className="text-small text-link hover:underline">
        {t('clearClient')}
      </Link>
    </p>
  );
}
