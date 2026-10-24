export type ClientRow = {
  id: string;
  name: string;
  accounts: { id: string; name: string; metaAccountId: string; confirmed: boolean; expired: boolean }[];
  recon?: { status: 'ok' | 'warning' | 'pending'; maxSpendDeltaPct: string | null };
  /** Chi tiêu 30 ngày theo tiền tệ, health thấp nhất, số vấn đề cao (O01/C01). */
  spend30?: Record<string, string>;
  health?: number | null;
  highIssues?: number;
  /** ADR-0017: chỉ số mục tiêu chính (null = chưa đặt). */
  goalMetric?: string | null;
  /** % so với mục tiêu 7 ngày qua (dương = tốt hơn). */
  goalVsPct?: number | null;
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

/** Ô tìm C01: khớp tên Client, tên hoặc ID tài khoản QC; không phân biệt dấu tiếng Việt. */
export function filterClients(rows: ClientRow[], q: string): ClientRow[] {
  const needle = norm(q);
  if (!needle) return rows;
  return rows.filter(
    (c) =>
      norm(c.name).includes(needle) ||
      c.accounts.some((a) => norm(a.name).includes(needle) || a.metaAccountId.includes(needle)),
  );
}
