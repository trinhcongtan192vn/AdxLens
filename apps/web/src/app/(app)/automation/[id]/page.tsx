import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getRule, liveBlocker, ruleEvaluationsFor } from '@adxlens/core/execution';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { MODE_TONE } from '@/lib/automation';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { RuleModeActions } from './rule-mode-actions';

export async function generateMetadata() {
  const t = await getTranslations('automation');
  return { title: t('detail') };
}

/**
 * P214 Kết quả shadow mode (P2-13): mỗi ngày dữ liệu, rule lẽ ra đã làm gì (kèm lý do guardrails chặn); bật
 * live chỉ khi đủ 14 ngày shadow (ADR-0012). Rule live: hành động đã tạo.
 */
export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2b_auto');
  requirePermission(pc, 'automation.manage');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const rule = await getRule(pc.ctx, id).catch(() => null);
  if (!rule) notFound();
  const t = await getTranslations('automation');
  const ta = await getTranslations('actionLog');
  const format = await getFormatter();
  const [evals, blocker] = await Promise.all([ruleEvaluationsFor(pc.ctx, id), liveBlocker(pc.ctx, rule)]);
  const shadowDays = rule.shadowStartedAt ? Math.floor((Date.now() - rule.shadowStartedAt.getTime()) / 86_400_000) : 0;
  const conditions = rule.condition
    .map((c) => `${t(`metrics.${c.metric}` as never)} ${c.op === 'gte' ? '≥' : '≤'} ${c.value}`)
    .join(' · ');
  const action = `${ta(`types.${rule.action.type}` as never)}${rule.action.changePct ? ` ${rule.action.changePct}%` : ''}`;
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="a" href="/automation" className="hover:text-fg">
            {t('title')}
          </Link>,
          rule.name,
        ]}
        title={
          <span className="flex items-center gap-3">
            {rule.name}
            <Badge tone={MODE_TONE[rule.mode]} data-testid="rule-mode">
              {t(`modes.${rule.mode}`)}
            </Badge>
          </span>
        }
        actions={<RuleModeActions id={rule.id} mode={rule.mode} liveBlocker={blocker} />}
      />
      <Card className="mb-4 px-4 py-4 text-body">
        <p className="text-fg">{t('summary', { level: t(`levels.${rule.level}`), conditions, action })}</p>
        {rule.mode === 'shadow' ? (
          <p className="mt-2 text-fg-secondary" data-testid="shadow-progress">
            {t('shadowProgress', { days: shadowDays, min: 14 })}
          </p>
        ) : null}
        {blocker && rule.mode !== 'live' ? (
          <p className="mt-1 text-small text-fg-secondary">{t(`liveBlockers.${blocker}` as never)}</p>
        ) : null}
      </Card>
      <Card>
        <CardHeader title={t('evaluations')} />
        {evals.length === 0 ? (
          <EmptyState title={t('noEvaluations')} description={t('noEvaluationsBody')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('cols.date')}</TH>
                <TH>{t('cols.mode')}</TH>
                <TH numeric>{t('cols.matched')}</TH>
                <TH>{t('cols.wouldDo')}</TH>
              </TR>
            </THead>
            <TBody>
              {evals.map((e) => (
                <TR key={e.id} data-testid="evaluation-row">
                  <TD muted>{e.asOfDate}</TD>
                  <TD>
                    <Badge tone={MODE_TONE[e.mode]}>{t(`modes.${e.mode}`)}</Badge>
                  </TD>
                  <TD numeric>{e.matchedEntities.length}</TD>
                  <TD>
                    {e.wouldDo.length === 0
                      ? '—'
                      : e.wouldDo.map((w) => (
                          <span key={w.metaId} className="block text-small">
                            {w.metaId}
                            {w.blockedBy ? ` · ${t('blocked', { reason: w.blockedBy })}` : ''}
                          </span>
                        ))}
                    {e.actionIds?.length ? (
                      <span className="block text-small text-fg-secondary">
                        {t('actionsCreated', { count: e.actionIds.length })}
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="border-t border-line px-4 py-3 text-small text-fg-secondary">
          {t('evaluatedNote', {
            at: evals[0] ? format.dateTime(evals[0].evaluatedAt, { dateStyle: 'short', timeStyle: 'short' }) : '—',
          })}
        </p>
      </Card>
    </>
  );
}
