// Đọc nhanh "Vì sao CPA tăng / giảm?" từ kết quả phân rã đã tính (core/reporting/cpa-change). Không tính lại số,
// chỉ sắp xếp và gắn nhãn để giao diện hiển thị; không phụ thuộc React để test được.

export type CpaFactorKey = 'cpm' | 'ctr' | 'cvr';
type Change = {
  changePct: number;
  factors: { key: CpaFactorKey; changePct: number; sharePct: number }[];
  drivers: { metaId: string; sharePct: number }[];
};

/** Yếu tố hiện trên thanh: bỏ yếu tố gần như không ảnh hưởng (< 5% mức thay đổi). */
export const CPA_FACTOR_MIN_SHARE = 5;
/** Một yếu tố giải thích từ mức này trở lên thì gọi là "nguyên nhân chính". */
export const CPA_MAIN_FACTOR_SHARE = 50;

export type CpaInsight = {
  direction: 'up' | 'down';
  /** CPA tăng là xấu, giảm là tốt. */
  good: boolean;
  /** Nguyên nhân chính (giải thích ≥ 50%), không có → nhiều yếu tố cùng lúc. */
  main: CpaFactorKey | null;
  factors: {
    key: CpaFactorKey;
    changePct: number;
    sharePct: number;
    /** Yếu tố đẩy CPA theo hướng xấu (tăng) hay tốt (giảm). */
    effect: 'worse' | 'better';
    /** Độ dài thanh 0–100 theo |phần giải thích|. */
    bar: number;
  }[];
  drivers: { metaId: string; sharePct: number; effect: 'worse' | 'better'; bar: number }[];
};

const bar = (share: number) => Math.min(100, Math.abs(share));

/**
 * `sharePct > 0`: yếu tố đi cùng chiều thay đổi CPA (góp phần làm CPA tăng khi CPA tăng, làm giảm khi CPA giảm);
 * `< 0`: bù ngược. Từ đó suy ra yếu tố làm CPA xấu đi hay tốt lên.
 */
export function cpaInsight(x: Change): CpaInsight {
  const direction = x.changePct > 0 ? 'up' : 'down';
  const effect = (share: number): 'worse' | 'better' => ((direction === 'up') === share > 0 ? 'worse' : 'better');
  const factors = x.factors
    .filter((f) => Math.abs(f.sharePct) >= CPA_FACTOR_MIN_SHARE)
    .sort((a, b) => b.sharePct - a.sharePct)
    .map((f) => ({ ...f, effect: effect(f.sharePct), bar: bar(f.sharePct) }));
  const top = factors[0];
  return {
    direction,
    good: direction === 'down',
    main: top && top.sharePct >= CPA_MAIN_FACTOR_SHARE ? top.key : null,
    factors,
    drivers: x.drivers.map((d) => ({
      metaId: d.metaId,
      sharePct: d.sharePct,
      effect: effect(d.sharePct),
      bar: bar(d.sharePct),
    })),
  };
}
