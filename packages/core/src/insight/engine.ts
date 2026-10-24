import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { adsManagerLink } from './deep-link';
import { RULES } from './rules';
import { loadSnapshot } from './snapshot';
import type { Candidate, Rule, Snapshot } from './types';

const { findings, ruleConfigs } = schema;

/** Cấu hình hiệu lực: mặc định trong code ← dòng toàn hệ thống ← ghi đè workspace. */
export async function effectiveConfigs(
  ctx: WorkspaceCtx,
  rules: Rule[],
): Promise<Map<string, { enabled: boolean; config: Record<string, number> }>> {
  const rows = await ctx.db
    .select()
    .from(ruleConfigs)
    .where(
      and(
        inArray(
          ruleConfigs.ruleId,
          rules.map((r) => r.id),
        ),
        or(isNull(ruleConfigs.workspaceId), eq(ruleConfigs.workspaceId, ctx.workspaceId)),
      ),
    );
  const out = new Map<string, { enabled: boolean; config: Record<string, number> }>();
  for (const r of rules) {
    const global = rows.find((x) => x.ruleId === r.id && x.workspaceId === null);
    const ws = rows.find((x) => x.ruleId === r.id && x.workspaceId === ctx.workspaceId);
    out.set(r.id, {
      enabled: ws?.enabled ?? global?.enabled ?? true,
      config: { ...r.defaults, ...(global?.config ?? {}), ...(ws?.config ?? {}) },
    });
  }
  return out;
}

function deepLinkFor(s: Snapshot, c: Candidate): string | null {
  if (c.entityType === 'account') return adsManagerLink(s.account.metaAccountId, null, null);
  return adsManagerLink(s.account.metaAccountId, c.entityType, c.metaId);
}

export type AuditResult = { status: 'ok'; detected: number; resolved: number; version: string } | { status: 'no_data' };

/**
 * Job `audit:run` (L3 7.3, 8): chạy mọi quy tắc bật trên ảnh chụp mới nhất, upsert phát hiện theo
 * ADR-0006 (một dòng mỗi quy tắc–đối tượng; tự `resolved` khi hết; `done`/`resolved` mở lại khi quay
 * lại; `dismissed` giữ nguyên). Một quy tắc lỗi không chặn các quy tắc khác.
 */
export async function runAudit(
  ctx: WorkspaceCtx,
  adAccountId: string,
  opts: { rules?: Rule[]; clock?: Clock; onRuleError?: (ruleId: string, e: unknown) => void } = {},
): Promise<AuditResult> {
  const clock = opts.clock ?? systemClock;
  const rules = opts.rules ?? RULES;
  const snap = await loadSnapshot(ctx, adAccountId, clock);
  if (!snap) return { status: 'no_data' };
  const configs = await effectiveConfigs(ctx, rules);
  const now = clock.now();
  let detected = 0;
  let resolved = 0;

  for (const rule of rules) {
    const cfg = configs.get(rule.id)!;
    let candidates: Candidate[] = [];
    if (cfg.enabled) {
      try {
        candidates = rule.detect(snap, cfg.config);
      } catch (e) {
        opts.onRuleError?.(rule.id, e);
        continue; // giữ nguyên phát hiện cũ của quy tắc lỗi
      }
    }
    const keys: string[] = [];
    for (const c of candidates) {
      keys.push(`${c.entityType}:${c.metaId}`);
      const values = {
        workspaceId: ctx.workspaceId,
        adAccountId,
        ruleId: rule.id,
        ruleGroup: rule.group,
        entityType: c.entityType,
        metaId: c.metaId,
        entityName: c.entityName,
        severity: c.severity,
        impactEstimate: c.impactEstimate,
        impactMethod: c.impactMethod,
        evidence: c.evidence,
        explanation: { why: c.why, whatToDo: c.whatToDo, deepLink: deepLinkFor(snap, c) },
        snapshotVersion: snap.version,
        lastSeenAt: now,
      };
      await ctx.db
        .insert(findings)
        .values({ ...values, firstSeenAt: now })
        .onConflictDoUpdate({
          target: [findings.adAccountId, findings.ruleId, findings.entityType, findings.metaId],
          set: {
            ...values,
            status: sql`case when ${findings.status} in ('done', 'resolved') then 'new' else ${findings.status} end`,
          },
        });
      detected++;
    }
    // Không còn phát hiện → resolved (chỉ phát hiện đang mở).
    const gone = await ctx.db
      .update(findings)
      .set({ status: 'resolved' })
      .where(
        and(
          eq(findings.workspaceId, ctx.workspaceId),
          eq(findings.adAccountId, adAccountId),
          eq(findings.ruleId, rule.id),
          inArray(findings.status, ['new', 'seen']),
          keys.length ? notInArray(sql`${findings.entityType} || ':' || ${findings.metaId}`, keys) : undefined,
        ),
      )
      .returning({ id: findings.id });
    resolved += gone.length;
  }
  return { status: 'ok', detected, resolved, version: snap.version };
}
