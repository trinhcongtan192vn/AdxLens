import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { automationEffectiveness } from '@adxlens/core/execution';
import { Badge, Banner, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { MODE_TONE } from '@/lib/automation';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('automation');
  return { title: t('effectiveness') };
}

/** Mục tiêu tỷ lệ hoàn tác (PRD 11.6). */
const UNDO_TARGET = 0.05;

/**
 * P215 Hiệu quả tự động hóa (P2-14), 30 ngày: hành động theo rule, thành công / thất bại / hoàn tác, chi tiêu
 * 7 ngày trước của đối tượng bị tạm dừng (ước tính, không phải nhân quả).
 */
export default async function AutomationResultsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2b_auto');
  requirePermission(pc, 'automation.manage');
  const t = await getTranslations('automation');
  const tr = await getTranslations('automation.results');
  const format = await getFormatter();
  const rows = await automationEffectiveness(pc.ctx);
  const total = rows.reduce((n, r) => n + r.total, 0);
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="a" href="/automation" className="hover:text-fg">
            {t('title')}
          </Link>,
          t('effectiveness'),
        ]}
        title={t('effectiveness')}
      />
      <Banner tone="info" className="mb-4">
        {tr('note')}
      </Banner>
      {total === 0 ? (
        <Card>
          <EmptyState title={tr('emptyTitle')} description={tr('emptyBody')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{tr('cols.rule')}</TH>
                <TH>{tr('cols.mode')}</TH>
                <TH numeric>{tr('cols.total')}</TH>
                <TH numeric>{tr('cols.success')}</TH>
                <TH numeric>{tr('cols.failed')}</TH>
                <TH numeric>{tr('cols.undoRate')}</TH>
                <TH numeric>{tr('cols.pausedSpend')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.ruleId} data-testid="effectiveness-row">
                  <TD>
                    <Link href={`/automation/${r.ruleId}`} className="font-medium text-fg hover:underline">
                      {r.name}
                    </Link>
                    <span className="block text-small text-fg-secondary">{r.accountName}</span>
                  </TD>
                  <TD>
                    <Badge tone={MODE_TONE[r.mode]}>{t(`modes.${r.mode}`)}</Badge>
                  </TD>
                  <TD numeric>{r.total}</TD>
                  <TD numeric>{r.success}</TD>
                  <TD numeric>{r.failed}</TD>
                  <TD numeric>
                    {r.undoRate === null ? (
                      '—'
                    ) : (
                      <Badge tone={r.undoRate <= UNDO_TARGET ? 'success' : 'danger'}>
                        {format.number(r.undoRate, { style: 'percent', maximumFractionDigits: 1 })}
                      </Badge>
                    )}
                  </TD>
                  <TD numeric>
                    {format.number(Number(r.pausedSpend7d), {
                      style: 'currency',
                      currency: r.currency,
                      maximumFractionDigits: r.currency === 'VND' ? 0 : 2,
                    })}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
