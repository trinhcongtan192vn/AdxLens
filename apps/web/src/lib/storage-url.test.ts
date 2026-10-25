import { describe, expect, it } from 'vitest';
import { publicStorageUrl } from './storage-url';

describe('link Storage cho trình duyệt', () => {
  const internal = 'http://127.0.0.1:54321';
  const pub = 'https://adxlens-dev-sb.sctech.io.vn/';

  it('đổi địa chỉ nội bộ sang địa chỉ công khai, giữ đường dẫn và chữ ký', () => {
    expect(publicStorageUrl(`${internal}/storage/v1/object/sign/reports/a.pdf?token=abc`, internal, pub)).toBe(
      'https://adxlens-dev-sb.sctech.io.vn/storage/v1/object/sign/reports/a.pdf?token=abc',
    );
    expect(publicStorageUrl(`${internal}/storage/v1/object/public/brand/l.png`, `${internal}/`, pub)).toBe(
      'https://adxlens-dev-sb.sctech.io.vn/storage/v1/object/public/brand/l.png',
    );
  });

  it('không cấu hình hoặc link của nơi khác → giữ nguyên', () => {
    const u = `${internal}/storage/v1/object/public/brand/l.png`;
    expect(publicStorageUrl(u, internal, undefined)).toBe(u);
    expect(publicStorageUrl('https://cdn.khac.vn/x.png', internal, pub)).toBe('https://cdn.khac.vn/x.png');
    expect(publicStorageUrl('http://127.0.0.1:543210/x', internal, pub)).toBe('http://127.0.0.1:543210/x');
  });
});
