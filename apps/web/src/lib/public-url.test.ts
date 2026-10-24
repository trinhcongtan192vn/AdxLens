import { describe, expect, it } from 'vitest';
import { publicOrigin, publicUrl } from './public-url';

const req = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: new Headers(headers),
});
// Request sau Cloudflare Tunnel: request.url là địa chỉ nội bộ.
const tunneled = req('http://localhost:3000/auth/callback?code=x', {
  'x-forwarded-host': 'adxlens-dev.sctech.io.vn',
  'x-forwarded-proto': 'https',
});

describe('origin công khai cho redirect', () => {
  it('ưu tiên APP_URL (bỏ đường dẫn / dấu / cuối)', () => {
    expect(publicOrigin(tunneled, 'https://adxlens-dev.sctech.io.vn/')).toBe('https://adxlens-dev.sctech.io.vn');
    expect(publicOrigin(req('http://localhost:3000/x'), 'https://adxlens-dev.sctech.io.vn')).toBe(
      'https://adxlens-dev.sctech.io.vn',
    );
  });

  it('không có APP_URL → x-forwarded-host + proto (mặc định https, lấy giá trị đầu)', () => {
    expect(publicOrigin(tunneled, '')).toBe('https://adxlens-dev.sctech.io.vn');
    expect(
      publicOrigin(
        req('http://localhost:3000/', { 'x-forwarded-host': 'a.vn, b.vn', 'x-forwarded-proto': 'http' }),
        '',
      ),
    ).toBe('http://a.vn');
    expect(publicOrigin(req('http://localhost:3000/', { 'x-forwarded-host': 'a.vn' }), '')).toBe('https://a.vn');
  });

  it('host chuyển tiếp không hợp lệ hoặc APP_URL sai → bỏ qua; không có gì → request.url (localhost)', () => {
    expect(publicOrigin(req('http://localhost:3000/', { 'x-forwarded-host': 'evil.vn/@x' }), '')).toBe(
      'http://localhost:3000',
    );
    expect(publicOrigin(req('http://127.0.0.1:3000/a'), 'khong-phai-url')).toBe('http://127.0.0.1:3000');
    expect(publicOrigin(req('http://localhost:3000/a'), '')).toBe('http://localhost:3000');
  });

  it('URL tuyệt đối cho đường dẫn nội bộ kèm query', () => {
    expect(publicUrl('/login?next=%2Foverview', tunneled, '').toString()).toBe(
      'https://adxlens-dev.sctech.io.vn/login?next=%2Foverview',
    );
  });
});
