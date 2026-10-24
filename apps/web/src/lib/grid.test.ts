import { describe, expect, it } from 'vitest';
import { addDecimal, pctChange } from './grid';

describe('bảng đối tượng (G1)', () => {
  it('cộng tiền trên chuỗi thập phân, không sai số số thực', () => {
    expect(addDecimal('0.1', '0.2')).toBe('0.3000');
    expect(addDecimal('4536445.0000', '4323886')).toBe('8860331.0000');
    expect(addDecimal('0', '-1.5')).toBe('-1.5000');
  });

  it('% so với kỳ trước; kỳ trước 0 hoặc thiếu → null', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });
});
