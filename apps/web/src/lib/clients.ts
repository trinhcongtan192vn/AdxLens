export type ClientRow = {
  id: string;
  name: string;
  accounts: { id: string; name: string; metaAccountId: string; confirmed: boolean; expired: boolean }[];
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
