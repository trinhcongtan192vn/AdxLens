/** Thứ tự bảng "Theo khách hàng": lệch mục tiêu nhiều nhất trước, rồi sức khỏe thấp trước, rồi theo tên. */
export function sortAgencyRows<T extends { name: string; health: number | null; vsTargetPct: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.vsTargetPct ?? 0) - (b.vsTargetPct ?? 0) ||
      (a.health ?? 100) - (b.health ?? 100) ||
      a.name.localeCompare(b.name),
  );
}
