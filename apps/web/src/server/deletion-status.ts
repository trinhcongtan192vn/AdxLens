import 'server-only';
import { deletionStatusByCode } from '@adxlens/core/ops';
import { deps } from './deps';

export type DeletionStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

/** Tra trạng thái yêu cầu xóa dữ liệu theo mã xác nhận (M05). Mã sai → null ("không tìm thấy"). */
export async function lookupDeletionStatus(code: string): Promise<DeletionStatus | null> {
  return (await deletionStatusByCode(deps().db, code))?.status ?? null;
}
