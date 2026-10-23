import 'server-only';
import type { schema } from '@adxlens/db';
import { translateText } from './translate';

type Finding = typeof schema.findings.$inferSelect;

/** Dạng trả API của một phát hiện (L3 10.2), giải thích đã dịch theo locale. */
export function findingDto(f: Finding, locale: 'vi' | 'en', currency: string | null = null) {
  return {
    id: f.id,
    rule_id: f.ruleId,
    group: f.ruleGroup,
    entity: { type: f.entityType, meta_id: f.metaId, name: f.entityName },
    severity: f.severity,
    impact_estimate:
      f.impactEstimate === null
        ? null
        : {
            amount: f.impactEstimate,
            currency,
            method: f.impactMethod ? translateText(locale, { key: f.impactMethod }) : null,
          },
    evidence: f.evidence,
    explanation: {
      why: translateText(locale, f.explanation.why),
      what_to_do: translateText(locale, f.explanation.whatToDo),
      deep_link: f.explanation.deepLink,
    },
    status: f.status,
    dismiss_reason: f.dismissReason,
    first_seen_at: f.firstSeenAt.toISOString(),
    last_seen_at: f.lastSeenAt.toISOString(),
  };
}
