import type { DbOrTx } from '@adxlens/db';
import type { schema } from '@adxlens/db';

export type FlagKey = schema.FlagKey;
export type ChecklistItemResult = schema.ChecklistItemResult;

/**
 * Một mục checklist kỹ thuật tự động (L3 18.3). Module khác đăng ký kiểm tra của mình khi tải;
 * core/flags chỉ chạy chúng, không biết chi tiết.
 */
export type FlagCheck = {
  id: string;
  label: string;
  run: (db: DbOrTx, workspaceId: string) => Promise<{ passed: boolean; detail?: string }>;
};

/** Việc cần làm khi cờ bị tắt (ví dụ: hủy action pending khi tắt p2a/p2b, L3 18.1). */
export type FlagDisabledHandler = (db: DbOrTx, workspaceId: string) => Promise<void>;

const checks = new Map<FlagKey, FlagCheck[]>();
const disabledHandlers = new Map<FlagKey, FlagDisabledHandler[]>();

export function registerFlagCheck(key: FlagKey, check: FlagCheck): void {
  const list = checks.get(key) ?? [];
  if (!list.some((c) => c.id === check.id)) list.push(check);
  checks.set(key, list);
}

export function onFlagDisabled(key: FlagKey, handler: FlagDisabledHandler): void {
  const list = disabledHandlers.get(key) ?? [];
  list.push(handler);
  disabledHandlers.set(key, list);
}

export function checksFor(key: FlagKey): FlagCheck[] {
  return checks.get(key) ?? [];
}

export function disabledHandlersFor(key: FlagKey): FlagDisabledHandler[] {
  return disabledHandlers.get(key) ?? [];
}

/** Chỉ dùng trong test. */
export function resetFlagRegistry(): void {
  checks.clear();
  disabledHandlers.clear();
}
