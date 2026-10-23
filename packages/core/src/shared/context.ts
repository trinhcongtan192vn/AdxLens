import type { DbOrTx } from '@adxlens/db';
import type { schema } from '@adxlens/db';

export type Role = schema.Role;

/** Người thực hiện thao tác trong một workspace (đã xác thực, đã kiểm tra là thành viên). */
export type Actor = {
  userId: string;
  role: Role;
  /** Rỗng = mọi Client. */
  clientAccess: string[];
  approveClientIds: string[];
};

/**
 * Ngữ cảnh bắt buộc cho mọi hàm đọc/ghi dữ liệu nghiệp vụ (CLAUDE.md quy tắc 1):
 * hàm core lấy workspaceId từ đây và luôn lọc theo nó.
 */
export type WorkspaceCtx = {
  db: DbOrTx;
  workspaceId: string;
};

export type ActorCtx = WorkspaceCtx & { actor: Actor };

/**
 * Actor hệ thống cho job worker chỉ ĐỌC dữ liệu của workspace (dựng báo cáo, digest): quyền xem mọi Client
 * trong đúng workspace của job, không dùng cho thao tác ghi thay người dùng.
 */
export const SYSTEM_ACTOR: Actor = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'manager',
  clientAccess: [],
  approveClientIds: [],
};

export type Clock = { now: () => Date };
export const systemClock: Clock = { now: () => new Date() };
