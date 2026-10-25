import { describe, expect, it } from 'vitest';
import { isSafeSvg, sniffImage } from './storage';

const enc = (s: string) => new TextEncoder().encode(s);

describe('kiểm tra file logo', () => {
  it('nhận PNG theo magic bytes', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });

  it('nhận SVG, từ chối file khác dù tên đuôi đúng', () => {
    expect(sniffImage(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
    expect(sniffImage(enc('GIF89a....'))).toBeNull();
    expect(sniffImage(enc('<html><script>'))).toBeNull();
  });

  it('SVG chứa script, handler sự kiện hoặc link ngoài bị coi là không an toàn', () => {
    expect(isSafeSvg(enc('<svg><circle r="4"/></svg>'))).toBe(true);
    expect(isSafeSvg(enc('<svg><script>alert(1)</script></svg>'))).toBe(false);
    expect(isSafeSvg(enc('<svg onload="alert(1)"></svg>'))).toBe(false);
    expect(isSafeSvg(enc('<svg><a href="javascript:x">'))).toBe(false);
    expect(isSafeSvg(enc('<svg><image href="https://evil/x.png"/></svg>'))).toBe(false);
    expect(isSafeSvg(enc('<svg><foreignObject></foreignObject></svg>'))).toBe(false);
  });
});
