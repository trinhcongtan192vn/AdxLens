/**
 * Múi giờ IANA hợp lệ. Không dùng `Intl.supportedValuesOf('timeZone')` vì danh sách đó chỉ chứa tên
 * chuẩn hóa (ví dụ "Asia/Saigon"), trong khi Meta và người dùng dùng "Asia/Ho_Chi_Minh".
 */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Tên cũ (link) mà trình duyệt/ICU có thể trả về → tên Meta và người dùng quen dùng. */
const ALIASES: Record<string, string> = {
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Etc/UTC': 'UTC',
};

export function canonicalTimeZone(tz: string): string {
  return ALIASES[tz] ?? tz;
}

/** Múi giờ gợi ý cho bộ chọn (A07, ST01): thị trường VN/SEA trước. */
export const COMMON_TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

/** Nhãn "Asia/Ho_Chi_Minh (GMT+7)" như Penpot A07/ST01. */
export function timeZoneLabel(tz: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  return part ? `${tz} (${part === 'GMT' ? 'GMT+0' : part})` : tz;
}

export const COMMON_CURRENCIES = ['VND', 'USD', 'THB', 'IDR', 'SGD', 'MYR', 'PHP', 'EUR'];
