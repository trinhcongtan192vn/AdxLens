/** Rút gọn ID tài khoản QC như Penpot S02: "act_1203…88". */
export function maskAccountId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-2)}` : id;
}

export type TokenState = { kind: 'valid' } | { kind: 'expired' } | { kind: 'expiring'; days: number };

/** Trạng thái token theo kết nối: hết hạn, còn ≤ 7 ngày, hoặc hợp lệ (Penpot S02). */
export function tokenState(status: string, expiresAt: Date | string | null, now = new Date()): TokenState {
  if (status !== 'active') return { kind: 'expired' };
  if (!expiresAt) return { kind: 'valid' };
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return { kind: 'expired' };
  const days = Math.ceil(ms / 86_400_000);
  return days <= 7 ? { kind: 'expiring', days } : { kind: 'valid' };
}
