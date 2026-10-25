import 'server-only';
import { z } from 'zod';

/**
 * G4: hành động từ bảng chiến dịch — tạm dừng / bật lại chiến dịch (ADR-0015), ad set, ad và đổi ngân sách ngày ad set
 * (ADR-0009, 0010). Nhân bản (ADR-0011) không làm từ bảng. Ngân sách nhập theo đơn vị tiền tệ của tài khoản (chuỗi thập phân).
 */
export const manualActionSchema = z
  .object({
    ad_account_id: z.string().uuid(),
    action_type: z.enum([
      'pause_ad',
      'resume_ad',
      'pause_adset',
      'resume_adset',
      'set_adset_budget',
      // ADR-0015: trạng thái chiến dịch (duyệt tay).
      'pause_campaign',
      'resume_campaign',
      // ADR-0025: đổi tên (duyệt tay).
      'rename_ad',
      'rename_adset',
      'rename_campaign',
      // ADR-0025: giá thầu nhóm QC, giới hạn chi chiến dịch (duyệt tay, đơn vị như ngân sách).
      'set_adset_bid',
      'set_campaign_spend_cap',
    ]),
    target_meta_id: z.string().regex(/^\d{1,30}$/),
    new_daily_budget: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,2})?$/)
      .nullish(),
    new_name: z.string().trim().min(1).max(400).nullish(),
    new_value: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,2})?$/)
      .nullish(),
  })
  .refine(
    (v) => !(v.action_type === 'set_adset_bid' || v.action_type === 'set_campaign_spend_cap') || Boolean(v.new_value),
    { message: 'Cần giá trị mới', path: ['new_value'] },
  )
  .refine((v) => !v.action_type.startsWith('rename_') || Boolean(v.new_name), {
    message: 'Cần tên mới',
    path: ['new_name'],
  })
  .refine((v) => v.action_type !== 'set_adset_budget' || Boolean(v.new_daily_budget), {
    message: 'Cần ngân sách mới',
    path: ['new_daily_budget'],
  });

export function toActionRequest(b: z.infer<typeof manualActionSchema>) {
  return {
    adAccountId: b.ad_account_id,
    actionType: b.action_type,
    targetMetaId: b.target_meta_id,
    newDailyBudget: b.new_daily_budget ?? null,
    newName: b.new_name ?? null,
    newValue: b.new_value ?? null,
  };
}
