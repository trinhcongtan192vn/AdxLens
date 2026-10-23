import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listAdAccounts } from '@adxlens/core/connections';
import { getRule, liveBlocker, ruleEvaluationsFor } from '@adxlens/core/execution';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { MODE_TONE } from '@/lib/automation';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { CopyRule } from './copy-rule';
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
  const [evals, blocker, accounts] = await Promise.all([
    ruleEvaluationsFor(pc.ctx, id),
    liveBlocker(pc.ctx, rule),
    listAdAccounts(pc.ctx),
  ]);
  const copyTargets = accounts.filter((a) => a.id !== rule.adAccountId).map((a) => ({ id: a.id, name: a.name }));
  const shadowDays = rule.shadowStartedAt ? Math.floor((Date.now() - rule.shadowStartedAt.getTime()) / 86_400_000) : 0;
  const conditions = rule.condition
    .map((c) => `${t(`metrics.${c.metric}` as never)} ${c.op === 'gte' ? '≥' : '≤'} ${c.value}`)
    .join(rule.match === 'any' ? ` ${t('or')} ` : ` ${t('and')} `);
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
        actions={
          <div className="flex gap-2">
            <CopyRule id={rule.id} name={rule.name} accounts={copyTargets} />
            <RuleModeActions id={rule.id} mode={rule.mode} liveBlocker={blocker} />
          </div>
        }
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
                    {e.matchedEntities.length === 0 ? (
                      <span className="text-small text-fg-tertiary">{t('log.none')}</span>
                    ) : (
                      <details data-testid="evaluation-detail">
                        <summary className="cursor-pointer text-small text-link">{t('log.matched')}</summary>
                        <ul className="mt-1 space-y-1">
                          {e.matchedEntities.map((m) => {
                            const w = e.wouldDo.find((x) => x.metaId === m.metaId);
                            return (
                              <li key={m.metaId} className="text-small">
                                <span className="font-medium">{m.name ?? m.metaId}</span>{' '}
                                <span className="num text-fg-secondary">
                                  {rule.condition
                                    .map((c) => `${t(`metrics.${c.metric}` as never)} ${m.metrics[c.metric] ?? '—'}`)
                                    .join(' · ')}
                                </span>
                                {w?.newDailyBudget ? ` · ${t('log.newBudget', { budget: w.newDailyBudget })}` : ''}
                                {w?.blockedBy ? (
                                  <span className="text-warning"> · {t('log.blockedBy', { reason: w.blockedBy })}</span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
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
