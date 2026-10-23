import { describe, expect, it } from 'vitest';
import { compareDecimal, deltaPct, fromScaled, mulRatio, sumDecimal, toScaled } from './decimal';

describe('số thập phân cố định', () => {
  it('chuyển đổi không mất chính xác', () => {
    expect(toScaled('123.45')).toBe(1234500n);
    expect(fromScaled(toScaled('-0.0001'))).toBe('-0.0001');
    expect(toScaled('0.00005')).toBe(1n); // làm tròn nửa lên
    expect(sumDecimal(['0.1', '0.2', null])).toBe('0.3000');
    expect(sumDecimal(['999999999999.9999', '0.0001'])).toBe('1000000000000.0000');
    expect(() => toScaled('1e3')).toThrow();
  });

  it('độ lệch % theo L3 6.4', () => {
    expect(deltaPct('101', '100')).toBe('1.000000');
    expect(deltaPct('615900000', '607400000')).toBe('1.399407');
    expect(deltaPct('0', '0')).toBe('0.000000');
    expect(deltaPct('5', '0')).toBe('9999.999999');
    expect(deltaPct('99', '100')).toBe('1.000000');
  });

  it('so sánh', () => {
    expect(compareDecimal('1.000000', '1')).toBe(0);
    expect(compareDecimal('1.000001', '1')).toBe(1);
  });

  it('tiền × tỷ lệ', () => {
    expect(mulRatio('2850000', 0.5)).toBe('1425000.0000');
    expect(mulRatio('100.0001', 0.333333)).toBe('33.3333'); // 33,33333…
    expect(mulRatio('1.0001', 0.5)).toBe('0.5001'); // 0,50005 làm tròn nửa lên
    expect(mulRatio('0', 0.9)).toBe('0.0000');
  });
});
