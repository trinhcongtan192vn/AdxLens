import { describe, expect, it } from 'vitest';
import { describeChange } from './actions';

const format = { number: (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', o).format(n) };
const tr = { t: (k: string) => k };

describe('describeChange (P203)', () => {
  it('trạng thái, ngân sách VND (đồng) và USD (cent), bản sao', () => {
    expect(
      describeChange(
        { beforeState: { status: 'ACTIVE' }, afterExpected: { status: 'PAUSED' }, currency: 'VND' },
        format,
        tr,
      ),
    ).toBe('state.ACTIVE → state.PAUSED');
    expect(
      describeChange(
        { beforeState: { daily_budget: '300000' }, afterExpected: { daily_budget: '330000' }, currency: 'VND' },
        format,
        tr,
      ),
    ).toBe('₫300,000 → ₫330,000');
    expect(
      describeChange(
        { beforeState: { daily_budget: '5000' }, afterExpected: { daily_budget: '5500' }, currency: 'USD' },
        format,
        tr,
      ),
    ).toBe('$50.00 → $55.00');
    expect(
      describeChange({ beforeState: {}, afterExpected: { copy_status: 'PAUSED' }, currency: 'VND' }, format, tr),
    ).toBe('copyPaused');
  });
});
