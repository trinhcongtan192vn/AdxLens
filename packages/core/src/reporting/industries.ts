/**
 * Danh mục ngành + ngành con cố định (ADR-0017), lấy cảm hứng từ onboarding Madgicx. Mã ổn định để làm template báo
 * cáo theo ngành / benchmark ẩn danh về sau; tên hiển thị nằm ở i18n `industries.<mã>`.
 */
export const INDUSTRIES = {
  ecommerce: ['fashion', 'beauty', 'home_living', 'electronics', 'food_beverage', 'mother_baby', 'sports', 'other'],
  hospitality: ['hotel_resort', 'restaurant_cafe', 'travel_agency', 'homestay_glamping', 'other'],
  real_estate: ['residential', 'commercial', 'rental', 'other'],
  education: ['language', 'k12', 'higher_ed', 'online_course', 'other'],
  health: ['clinic', 'dental', 'spa_aesthetic', 'pharmacy', 'fitness', 'other'],
  finance: ['banking', 'insurance', 'investment', 'lending', 'other'],
  automotive: ['dealer', 'service', 'rental', 'other'],
  services: ['agency_marketing', 'legal_consulting', 'home_services', 'events', 'other'],
  saas_tech: ['b2b_software', 'consumer_app', 'gaming', 'other'],
  local_business: ['retail_store', 'franchise', 'other'],
  other: ['other'],
} as const;

export type Industry = keyof typeof INDUSTRIES;

export function isValidIndustry(industry: string | null, sub: string | null): boolean {
  if (industry == null) return sub == null;
  const subs = (INDUSTRIES as Record<string, readonly string[]>)[industry];
  if (!subs) return false;
  return sub == null || subs.includes(sub);
}
