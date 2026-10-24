import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardHeader, EmptyState } from '@adxlens/ui';
import { adminSearch } from '@adxlens/core/ops';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';

export async function generateMetadata() {
  const t = await getTranslations('admin.search');
  return { title: t('title') };
}

/**
 * Kết quả ô tìm kiếm chung (thanh trên admin): workspace, tài khoản QC, mã xóa dữ liệu. Chỉ một kết quả → mở thẳng
 * trang chi tiết workspace (luồng hỗ trợ khách).
 */
export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const t = await getTranslations('admin.search');
  const q = ((await searchParams).q ?? '').trim();
  const r = await adminSearch(deps().db, q);
  const targets = [
    ...r.workspaces.map((w) => w.id),
    ...r.accounts.map((a) => a.workspaceId),
    ...r.deletions.map((d) => d.workspaceId).filter((x): x is string => !!x),
  ];
  if (targets.length === 1) redirect(`/admin/workspaces/${targets[0]}`);
  const ws = (id: string | null, name: string | null) =>
    id ? (
      <Link href={`/admin/workspaces/${id}`} className="text-link hover:underline">
        {name}
      </Link>
    ) : (
      <span className="text-fg-tertiary">—</span>
    );

  return (
    <div className="max-w-[900px]">
      <h1 className="mb-1 text-h1 font-semibold">{t('title')}</h1>
      <p className="mb-4 text-body text-fg-secondary">{q ? t('for', { q }) : t('hint')}</p>
      {q && targets.length === 0 ? (
        <Card>
          <EmptyState title={t('none')} description={t('hint')} />
        </Card>
      ) : null}
      {r.workspaces.length ? (
        <Card className="mb-4">
          <CardHeader title={t('workspaces', { count: r.workspaces.length })} />
          <ul className="divide-y divide-line text-body">
            {r.workspaces.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1">{ws(w.id, w.name)}</span>
                <span className="text-small text-fg-tertiary">{w.ownerEmail}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {r.accounts.length ? (
        <Card className="mb-4">
          <CardHeader title={t('accounts', { count: r.accounts.length })} />
          <ul className="divide-y divide-line text-body">
            {r.accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1">
                  {a.name} <span className="num text-small text-fg-tertiary">{a.metaAccountId}</span>
                </span>
                {ws(a.workspaceId, a.workspaceName)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {r.deletions.length ? (
        <Card className="mb-4">
          <CardHeader title={t('deletions', { count: r.deletions.length })} />
          <ul className="divide-y divide-line text-body">
            {r.deletions.map((d) => (
              <li key={d.code} className="flex items-center gap-3 px-4 py-2">
                <span className="num flex-1">
                  {d.code} · {d.status}
                </span>
                {ws(d.workspaceId, d.workspaceName)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
