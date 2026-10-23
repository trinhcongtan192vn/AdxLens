// Chỉ dùng trong test: dựng ảnh chụp tổng hợp ngắn gọn cho fixture quy tắc.
import type { EntitySnapshot, Metrics, Snapshot } from './types';

export function m(p: Partial<Metrics> = {}): Metrics {
  return {
    spend: '0',
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    results: 0,
    conversionValue: '0',
    frequency: 0,
    activeDays: 7,
    ...p,
  };
}

export function ent(
  metaId: string,
  p: Partial<Omit<EntitySnapshot, 'cur' | 'prev'>> & { cur?: Partial<Metrics>; prev?: Partial<Metrics> } = {},
): EntitySnapshot {
  const { cur, prev, ...rest } = p;
  return {
    metaId,
    name: `E ${metaId}`,
    status: 'ACTIVE',
    parentMetaId: null,
    objective: null,
    dailyBudget: null,
    learningStage: null,
    attrs: {},
    ...rest,
    cur: m(cur),
    prev: m(prev),
  };
}

export function snapshot(p: Partial<Snapshot> = {}): Snapshot {
  return {
    account: { id: 'acc', metaAccountId: 'act_1', name: 'Acc', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
    version: 'v',
    window: { cur: { from: '2026-10-16', to: '2026-10-22' }, prev: { from: '2026-10-09', to: '2026-10-15' } },
    campaigns: [],
    adsets: [],
    ads: [],
    daily: [],
    daysWithData: 28,
    ...p,
  };
}
