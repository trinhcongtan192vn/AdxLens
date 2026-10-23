import { describe, expect, it } from 'vitest';
import { canonicalTimeZone, COMMON_TIMEZONES, isValidTimeZone, timeZoneLabel } from './timezone';

describe('múi giờ', () => {
  it('nhận Asia/Ho_Chi_Minh và mọi múi giờ gợi ý', () => {
    for (const tz of COMMON_TIMEZONES) expect(isValidTimeZone(tz), tz).toBe(true);
  });

  it('từ chối giá trị lạ', () => {
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('chuẩn hóa tên cũ Asia/Saigon thành Asia/Ho_Chi_Minh', () => {
    expect(canonicalTimeZone('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
    expect(canonicalTimeZone('Asia/Bangkok')).toBe('Asia/Bangkok');
  });

  it('nhãn có độ lệch GMT', () => {
    expect(timeZoneLabel('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh (GMT+7)');
  });
});
