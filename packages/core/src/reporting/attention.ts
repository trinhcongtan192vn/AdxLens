import { listAdAccounts } from '@adxlens/core/connections';
import { systemClock, type ActorCtx, type Clock } from '@adxlens/core/shared';
import type { ClientRowOverview } from './overview';
import { clientPacing } from './pacing';

/** Health dưới mức này coi là cần chú ý. */
export const ATTENTION_HEALTH_BELOW = 60;

export type AttentionReason =
  | { kind: 'recon_warning'; pct: string | null }
  | { kind: 'high_issues'; count: number }
  | { kind: 'low_health'; score: number }
  | { kind: 'budget'; status: 'over' | 'under'; pct: number | null }
  | { kind: 'sync_error'; accounts: number };

export type ClientAttention = { clientId: string; name: string; reasons: AttentionReason[] };

const WEIGHT: Record<AttentionReason['kind'], number> = {
  recon_warning: 5,
  sync_error: 4,
  high_issues: 3,
  budget: 2,
  low_health: 1,
};

/**
 * G3 — "Khách cần chú ý" ở tổng quan agency (như cảnh báo ở tài khoản quản lý Google Ads): gom các tín hiệu đã có
 * (đối chiếu lệch, đồng bộ lỗi, vấn đề mức cao, ngân sách tháng lệch tiến độ từ ngày thứ 5, health thấp) cho từng
 * Client; xếp theo mức nghiêm trọng. Không tính lại số — chỉ đọc kết quả đã tính.
 */
export async function clientsNeedingAttention(
  ctx: ActorCtx,
  clients: ClientRowOverview[],
  clock: Clock = systemClock,
): Promise<ClientAttention[]> {
  const accounts = await listAdAccounts(ctx);
  const out: ClientAttention[] = [];
  for (const c of clients) {
    const reasons: AttentionReason[] = [];
    const warn = c.accounts.filter((a) => a.recon.status === 'warning');
    if (warn.length) {
      const pct = warn.map((a) => a.recon.maxSpendDeltaPct).find((p) => p !== null) ?? null;
      reasons.push({ kind: 'recon_warning', pct });
    }
    const ids = new Set(c.accounts.map((a) => a.id));
    const broken = accounts.filter((a) => ids.has(a.id) && (a.syncStatus === 'error' || a.syncStatus === 'no_access'));
    if (broken.length) reasons.push({ kind: 'sync_error', accounts: broken.length });
    if (c.highIssues > 0) reasons.push({ kind: 'high_issues', count: c.highIssues });
    const p = c.accounts.length ? await clientPacing(ctx, c.id, clock) : null;
    if (p && p.status !== 'on_track' && p.daysElapsed >= 5) {
      reasons.push({ kind: 'budget', status: p.status, pct: p.projectedPct });
    }
    if (c.health !== null && c.health < ATTENTION_HEALTH_BELOW) reasons.push({ kind: 'low_health', score: c.health });
    if (reasons.length) out.push({ clientId: c.id, name: c.name, reasons });
  }
  const score = (x: ClientAttention) => x.reasons.reduce((s, r) => s + WEIGHT[r.kind], 0);
  return out.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
