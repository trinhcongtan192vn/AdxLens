import 'server-only';

/** DTO hành động cho API (không có dữ liệu nhạy cảm; thông điệp lỗi đã che ở gateway). */
export const actionDto = (a: {
  id: string;
  adAccountId: string;
  accountName: string;
  actionType: string;
  targetType: string;
  targetMetaId: string;
  targetName: string | null;
  tier: string;
  beforeState: unknown;
  afterExpected: unknown;
  afterState: unknown;
  status: string;
  resultCode: string | null;
  errorMessage: string | null;
  approverName?: string | null;
  undoOf: string | null;
  undoable: boolean;
  createdAt: Date;
  executedAt: Date | null;
}) => ({
  id: a.id,
  ad_account_id: a.adAccountId,
  account_name: a.accountName,
  action_type: a.actionType,
  target: { type: a.targetType, meta_id: a.targetMetaId, name: a.targetName },
  tier: a.tier,
  before: a.beforeState,
  after_expected: a.afterExpected,
  after: a.afterState,
  status: a.status,
  result_code: a.resultCode,
  error: a.errorMessage,
  approved_by: a.approverName ?? null,
  undo_of: a.undoOf,
  undoable: a.undoable,
  created_at: a.createdAt,
  executed_at: a.executedAt,
});
