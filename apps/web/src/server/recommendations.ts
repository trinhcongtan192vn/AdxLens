import 'server-only';
import type { WeeklyActionItem } from '@adxlens/core/recommendation';

export const recommendationDto = (r: WeeklyActionItem) => ({
  id: r.id,
  week: r.week,
  ad_account_id: r.adAccountId,
  account_name: r.accountName,
  client_name: r.clientName,
  currency: r.currency,
  source: r.source,
  source_key: r.sourceKey,
  entity_type: r.entityType,
  meta_id: r.metaId,
  entity_name: r.entityName,
  action: r.action,
  why: r.why,
  evidence: r.evidence,
  impact_estimate: r.impactEstimate,
  confidence: r.confidence,
  effort_minutes: r.effortMinutes,
  score: r.score,
  status: r.status,
  skip_reason: r.skipReason,
  assignee_id: r.assigneeId,
  assignee_name: r.assigneeName,
  done_at: r.doneAt,
});
