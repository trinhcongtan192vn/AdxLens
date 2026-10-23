import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { EntityRow } from '@adxlens/core/reporting';
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';

/**
 * C02 tab Chiến dịch / Nhóm QC / Quảng cáo (Penpot): CHI TIÊU, HIỂN THỊ, CLICK, CTR, KẾT QUẢ, CPA, ROAS.
 * Tiền theo tiền tệ tài khoản; nhiều tiền tệ thì ghi kèm.
 */
export async function EntityTable({
  rows,
  level,
  currencyOf,
}: {
  rows: EntityRow[];
  level: 'campaign' | 'adset' | 'ad';
  currencyOf: Record<string, string>;
}) {
  const t = await getTranslations('entities');
  const format = await getFormatter();
  const multi = new Set(Object.values(currencyOf)).size > 1;
  if (!rows.length) {
    return (
      <Card>
        <EmptyState title={t(`empty.${level}`)} />
      </Card>
    );
  }
  const money = (v: string | null, acc: string) => {
    if (v === null) return '—';
    const cur = currencyOf[acc] ?? '';
    return `${format.number(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })}${multi ? ` ${cur}` : ''}`;
  };
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>{t(`level.${level}`)}</TH>
            <TH>{t('cols.status')}</TH>
            <TH numeric>{t('cols.spend')}</TH>
            <TH numeric>{t('cols.impressions')}</TH>
            <TH numeric>{t('cols.clicks')}</TH>
            <TH numeric>{t('cols.ctr')}</TH>
            <TH numeric>{t('cols.results')}</TH>
            <TH numeric>{t('cols.cpa')}</TH>
            <TH numeric>{t('cols.roas')}</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={`${r.adAccountId}:${r.metaId}`}>
              <TD>
                <Link href={`/accounts/${r.adAccountId}`} className="font-medium text-fg hover:text-brand">
                  {r.name ?? r.metaId}
                </Link>
              </TD>
              <TD>
                <Badge tone={(r.status ?? '').toUpperCase() === 'ACTIVE' ? 'success' : 'neutral'}>
                  {t.has(`status.${(r.status ?? '').toUpperCase()}`)
                    ? t(`status.${(r.status ?? '').toUpperCase()}`)
                    : (r.status ?? '—')}
                </Badge>
              </TD>
              <TD numeric>{money(r.kpis.spend, r.adAccountId)}</TD>
              <TD numeric>{format.number(r.kpis.impressions)}</TD>
              <TD numeric>{format.number(r.kpis.linkClicks)}</TD>
              <TD numeric>
                {r.kpis.ctr === null ? '—' : format.number(r.kpis.ctr, { style: 'percent', maximumFractionDigits: 2 })}
              </TD>
              <TD numeric>{format.number(r.kpis.results)}</TD>
              <TD numeric>{money(r.kpis.cpa, r.adAccountId)}</TD>
              <TD numeric>
                {r.kpis.roas === null ? '—' : format.number(Number(r.kpis.roas), { maximumFractionDigits: 2 })}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
