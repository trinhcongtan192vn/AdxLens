import { describe, expect, it } from 'vitest';
import { metricLabel, recentWarningDates, worstRecon } from './recon';

describe('đối chiếu trên giao diện', () => {
  it('Client lệch nếu có một tài khoản lệch; % lớn nhất; chưa có → pending', () => {
    expect(
      worstRecon([
        { status: 'ok', maxSpendDeltaPct: '0.300000' },
        { status: 'warning', maxSpendDeltaPct: '1.380000' },
        { status: 'pending', maxSpendDeltaPct: null },
      ]),
    ).toEqual({ status: 'warning', maxSpendDeltaPct: '1.380000' });
    expect(worstRecon([{ status: 'pending', maxSpendDeltaPct: null }])).toEqual({
      status: 'pending',
      maxSpendDeltaPct: null,
    });
  });
  it('nhãn chỉ số kết quả', () => {
    expect(metricLabel('spend')).toEqual({ key: 'spend' });
    expect(metricLabel('result:offsite_conversion.fb_pixel_purchase')).toEqual({ key: 'purchase' });
    expect(metricLabel('result:app_install')).toEqual({ key: 'other', type: 'app_install' });
  });
  it('ngày lệch gần đây (3 ngày tới hôm qua)', () => {
    expect(recentWarningDates(['2026-10-10', '2026-10-20', '2026-10-22'], '2026-10-22')).toEqual([
      '2026-10-20',
      '2026-10-22',
    ]);
  });
});
