import type { MetaAction } from '@adxlens/meta-client';

/**
 * Kết quả theo mục tiêu tối ưu của ad set (L3 6.3): mỗi `optimization_goal` ứng với danh sách
 * action_type theo thứ tự ưu tiên; lấy loại đầu tiên có trong `actions`. Goal không có trong bảng
 * (REACH, IMPRESSIONS…) → không tính kết quả.
 */
export const RESULT_ACTIONS: Record<string, readonly string[]> = {
  OFFSITE_CONVERSIONS: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
  VALUE: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
  LEAD_GENERATION: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  QUALITY_LEAD: ['lead', 'onsite_conversion.lead_grouped'],
  LINK_CLICKS: ['link_click'],
  LANDING_PAGE_VIEWS: ['landing_page_view'],
  CONVERSATIONS: ['onsite_conversion.messaging_conversation_started_7d'],
  POST_ENGAGEMENT: ['post_engagement'],
  APP_INSTALLS: ['mobile_app_install', 'app_install'],
};

/** Sự kiện chuyển đổi tùy chỉnh của ad set (promoted_object.custom_event_type) → action_type. */
const CUSTOM_EVENT_ACTIONS: Record<string, string> = {
  PURCHASE: 'offsite_conversion.fb_pixel_purchase',
  LEAD: 'offsite_conversion.fb_pixel_lead',
  COMPLETE_REGISTRATION: 'offsite_conversion.fb_pixel_complete_registration',
  ADD_TO_CART: 'offsite_conversion.fb_pixel_add_to_cart',
  INITIATED_CHECKOUT: 'offsite_conversion.fb_pixel_initiate_checkout',
};

export function resultActionTypes(goal: string | null | undefined, customEvent?: string | null): string[] {
  const base = [...(RESULT_ACTIONS[goal ?? ''] ?? [])];
  const custom = customEvent ? CUSTOM_EVENT_ACTIONS[customEvent] : undefined;
  if (custom && goal === 'OFFSITE_CONVERSIONS') return [custom, ...base.filter((x) => x !== custom)];
  return base;
}

/** Số kết quả + giá trị chuyển đổi của cùng action_type. Giá trị giữ dạng chuỗi thập phân. */
export function extractResult(
  types: readonly string[],
  actions: MetaAction[] | undefined,
  values: MetaAction[] | undefined,
): { results: number; resultType: string | null; conversionValue: string | null } {
  for (const t of types) {
    const a = actions?.find((x) => x.action_type === t);
    if (a) {
      const v = values?.find((x) => x.action_type === t);
      return { results: Math.round(Number(a.value)), resultType: t, conversionValue: v ? toDecimal(v.value) : null };
    }
  }
  return { results: 0, resultType: types[0] ?? null, conversionValue: null };
}

/**
 * Chuẩn hóa chuỗi số tiền Meta trả về thành chuỗi thập phân cho cột numeric — không đi qua float
 * (CLAUDE.md quy tắc 4). Chuỗi không hợp lệ → lỗi, không lưu số sai.
 */
export function toDecimal(v: string): string {
  const s = v.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Số không hợp lệ từ Meta: ${s.slice(0, 32)}`);
  return s;
}
