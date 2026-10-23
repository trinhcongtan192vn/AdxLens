import type { EntityRow, Kpis } from './metrics';

/** Đủ dữ liệu để giải thích: mỗi kỳ ≥ 10 kết quả, có hiển thị và click liên kết (thà không giải thích còn hơn sai). */
export const CPA_EXPLAIN_MIN_RESULTS = 10;
/** CPA đổi ít hơn mức này thì không giải thích (coi như ổn định). */
export const CPA_EXPLAIN_MIN_CHANGE_PCT = 5;
export const CPA_DRIVERS_LIMIT = 3;

export type CpaFactorKey = 'cpm' | 'ctr' | 'cvr';

export type CpaChange = {
  /** CPA hai kỳ (chuỗi decimal từ số liệu đã tính) và % thay đổi. */
  current: string;
  previous: string;
  changePct: number;
  /**
   * CPA = CPM / 1000 / CTR / CVR (CTR = click liên kết / hiển thị, CVR = kết quả / click liên kết). `changePct`: thay đổi
   * của từng yếu tố; `sharePct`: phần của thay đổi CPA do yếu tố đó (log, cộng lại = 100%), dương = làm CPA tăng.
   */
  factors: { key: CpaFactorKey; changePct: number; sharePct: number }[];
  /** Chiến dịch đóng góp nhiều nhất vào thay đổi CPA (phân rã cộng chính xác theo kết quả kỳ này). */
  drivers: {
    metaId: string;
    name: string | null;
    sharePct: number;
    cpa: string | null;
    previousCpa: string | null;
    spend: string;
  }[];
};

const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
const round1 = (v: number) => Math.round(v * 10) / 10;

function rates(k: Kpis) {
  const spend = Number(k.spend);
  return {
    spend,
    cpm: (spend / k.impressions) * 1000,
    ctr: k.linkClicks / k.impressions,
    cvr: k.results / k.linkClicks,
    cpa: spend / k.results,
  };
}

function enough(k: Kpis) {
  return k.results >= CPA_EXPLAIN_MIN_RESULTS && k.impressions > 0 && k.linkClicks > 0 && Number(k.spend) > 0;
}

/**
 * "Vì sao CPA thay đổi?" (roadmap A1): phân rã thay đổi CPA giữa hai kỳ thành CPM, CTR, CVR và chiến dịch đóng góp
 * nhiều nhất. Hàm thuần trên số đã tính; không đủ dữ liệu hoặc CPA gần như không đổi → null. LLM chỉ diễn giải kết
 * quả này (các số được đưa vào danh sách kiểm số của tóm tắt).
 */
export function explainCpaChange(
  current: Kpis,
  previous: Kpis,
  campaigns: { current: EntityRow[]; previous: EntityRow[] },
): CpaChange | null {
  if (!enough(current) || !enough(previous) || !current.cpa || !previous.cpa) return null;
  const c = rates(current);
  const p = rates(previous);
  const changePct = pct(c.cpa, p.cpa);
  if (Math.abs(changePct) < CPA_EXPLAIN_MIN_CHANGE_PCT) return null;

  // ln(CPA2/CPA1) = ln(CPM2/CPM1) − ln(CTR2/CTR1) − ln(CVR2/CVR1).
  const total = Math.log(c.cpa / p.cpa);
  const parts: [CpaFactorKey, number, number][] = [
    ['cpm', Math.log(c.cpm / p.cpm), pct(c.cpm, p.cpm)],
    ['ctr', -Math.log(c.ctr / p.ctr), pct(c.ctr, p.ctr)],
    ['cvr', -Math.log(c.cvr / p.cvr), pct(c.cvr, p.cvr)],
  ];
  const factors = parts
    .map(([key, ln, change]) => ({ key, changePct: round1(change), sharePct: round1((ln / total) * 100) }))
    .sort((a, b) => b.sharePct - a.sharePct);

  // ΔCPA = Σ_i [(s2_i − CPA1·r2_i)/R2 − (s1_i − CPA1·r1_i)/R1] (cộng lại đúng bằng CPA2 − CPA1).
  const prevBy = new Map(campaigns.previous.map((e) => [e.metaId, e]));
  const ids = new Set([...campaigns.current.map((e) => e.metaId), ...prevBy.keys()]);
  const curBy = new Map(campaigns.current.map((e) => [e.metaId, e]));
  const delta = c.cpa - p.cpa;
  const contributions = [...ids].map((id) => {
    const a = curBy.get(id);
    const b = prevBy.get(id);
    const s2 = Number(a?.kpis.spend ?? 0);
    const r2 = a?.kpis.results ?? 0;
    const s1 = Number(b?.kpis.spend ?? 0);
    const r1 = b?.kpis.results ?? 0;
    const value = (s2 - p.cpa * r2) / current.results - (s1 - p.cpa * r1) / previous.results;
    return { id, row: a ?? b!, value, cur: a, prev: b };
  });
  const drivers = contributions
    // Chỉ chiến dịch đẩy CPA cùng chiều thay đổi (giải thích "vì sao tăng" / "vì sao giảm").
    .filter((x) => Math.sign(x.value) === Math.sign(delta) && x.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, CPA_DRIVERS_LIMIT)
    .map((x) => ({
      metaId: x.id,
      name: x.row.name,
      sharePct: round1((x.value / delta) * 100),
      cpa: x.cur?.kpis.cpa ?? null,
      previousCpa: x.prev?.kpis.cpa ?? null,
      spend: x.cur?.kpis.spend ?? '0',
    }));

  return { current: current.cpa, previous: previous.cpa, changePct: round1(changePct), factors, drivers };
}
