import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { agencyOverview, clientsNeedingAttention } from '@adxlens/core/reporting';
import { can } from '@adxlens/core/tenancy';
import { Badge, Banner, buttonVariants, Card, CardHeader } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';

/**
 * Khối "Khách cần chú ý" của agency (chuyển từ Tổng quan O01 cũ khi gộp giao diện): lệch đối chiếu, lỗi đồng bộ, nhiều
 * phát hiện mức cao, nhịp chi so ngân sách tháng, sức khỏe thấp. Kèm cảnh báo tài khoản chưa gán Client. Số do code tính.
 */
export async function AgencyAttention() {
  const pc = await getPageContext();
  const t = await getTranslations('overview');
  const format = await getFormatter();
  const { clients, unassigned } = await agencyOverview(pc.ctx);
  const attention = await clientsNeedingAttention(pc.ctx, clients);
  return (
    <>
      {unassigned.length ? (
        <Banner
          tone="warning"
          className="mb-3"
          title={t('unassignedTitle')}
          action={
            can(pc.ctx.actor.role, 'clients.manage') ? (
              <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
                {t('assign')}
              </Link>
            ) : null
          }
        >
          {t('unassignedBody', { count: unassigned.length })}
        </Banner>
      ) : null}
      {clients.length ? (
        <Card className="mb-4" data-testid="attention">
          <CardHeader title={t('attention.title', { count: attention.length })} />
          {attention.length === 0 ? (
            <p className="px-4 py-3 text-body text-fg-secondary">{t('attention.none')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.clientId} className="flex flex-wrap items-center gap-2 px-4 py-2 text-body">
                  <Link href={`/clients/${a.clientId}`} className="min-w-40 font-medium text-fg hover:text-brand">
                    {a.name}
                  </Link>
                  {a.reasons.map((r) => (
                    <Badge
                      key={r.kind}
                      tone={r.kind === 'recon_warning' || r.kind === 'sync_error' ? 'danger' : 'warning'}
                    >
                      {r.kind === 'recon_warning'
                        ? t('attention.recon', {
                            pct:
                              r.pct === null ? '—' : `${format.number(Number(r.pct), { maximumFractionDigits: 1 })}%`,
                          })
                        : r.kind === 'sync_error'
                          ? t('attention.sync', { count: r.accounts })
                          : r.kind === 'high_issues'
                            ? t('attention.issues', { count: r.count })
                            : r.kind === 'budget'
                              ? t('attention.budget', {
                                  status: r.status,
                                  pct: format.number(Math.abs(r.pct ?? 0), { maximumFractionDigits: 0 }),
                                })
                              : t('attention.health', { score: r.score })}
                    </Badge>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
