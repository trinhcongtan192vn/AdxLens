/** Lựa chọn trong ô Client của S05: Client có sẵn hoặc tạo mới theo tên gợi ý. */
export type AssignChoice = { kind: 'existing'; clientId: string } | { kind: 'new'; name: string } | { kind: 'none' };

export type AssignRow = {
  clientId: string | null;
  suggestedClientName: string | null;
  assignmentStatus: string;
};

/** Mặc định của dòng: Client đã gợi ý/gán → chọn sẵn; chưa có → tạo mới theo tên gợi ý. */
export function defaultChoice(row: AssignRow): AssignChoice {
  if (row.clientId) return { kind: 'existing', clientId: row.clientId };
  if (row.suggestedClientName?.trim()) return { kind: 'new', name: row.suggestedClientName.trim() };
  return { kind: 'none' };
}

/** Badge "Khớp tên" chỉ khi gợi ý trúng Client có sẵn và chưa xác nhận. */
export function isNameMatch(row: AssignRow): boolean {
  return row.assignmentStatus === 'suggested' && row.clientId !== null;
}

export function encodeChoice(c: AssignChoice): string {
  return c.kind === 'existing' ? `c:${c.clientId}` : c.kind === 'new' ? `n:${c.name}` : '';
}

export function decodeChoice(v: string): AssignChoice {
  if (v.startsWith('c:')) return { kind: 'existing', clientId: v.slice(2) };
  if (v.startsWith('n:') && v.slice(2).trim()) return { kind: 'new', name: v.slice(2) };
  return { kind: 'none' };
}

/** Body cho POST /ad-accounts/{id}/assign; null khi chưa chọn. */
export function assignBody(c: AssignChoice): { client_id: string } | { create_client_name: string } | null {
  if (c.kind === 'existing') return { client_id: c.clientId };
  if (c.kind === 'new') return { create_client_name: c.name };
  return null;
}
