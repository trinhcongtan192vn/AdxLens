import 'server-only';

export type DeletionStatus = 'pending' | 'in_progress' | 'done';

/**
 * Tra trạng thái yêu cầu xóa dữ liệu theo mã xác nhận. Bảng yêu cầu xóa có ở feature 014
 * (ngắt kết nối và xóa dữ liệu); trước đó mọi mã đều "không tìm thấy".
 */
export async function lookupDeletionStatus(code: string): Promise<DeletionStatus | null> {
  if (!/^XD-[A-Z0-9]{8}$/.test(code.trim().toUpperCase())) return null;
  return null;
}
