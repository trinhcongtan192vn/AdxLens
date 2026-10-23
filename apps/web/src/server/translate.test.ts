import { describe, expect, it } from 'vitest';
import { RULES } from '@adxlens/core/insight';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { translateText } from './translate';

describe('văn bản quy tắc audit', () => {
  it('mọi quy tắc có tên, why, what ở cả vi và en; nhóm có nhãn', () => {
    for (const msgs of [vi, en] as const) {
      const rules = msgs.rules as Record<string, Record<string, string>>;
      for (const r of RULES) {
        expect(rules[r.id], r.id).toBeDefined();
        expect(rules[r.id]!.name && rules[r.id]!.why && rules[r.id]!.what, r.id).toBeTruthy();
        expect((msgs.rules.groups as Record<string, string>)[r.group], r.group).toBeTruthy();
      }
    }
  });

  it('dịch kèm tham số, không còn placeholder; khóa thiếu → trả lại khóa', () => {
    const s = translateText('vi', {
      key: 'rules.creative_fatigue.why',
      params: { freqRise: 62, ctrDrop: 50, freq: 3.4 },
    });
    expect(s).toBe('Tần suất tăng 62% (lên 3,4) trong khi CTR giảm 50% so với 7 ngày trước.');
    expect(translateText('en', { key: 'rules.fragmentation.why', params: { weak: 6, total: 6 } })).not.toMatch(/[{}]/);
    expect(translateText('vi', { key: 'rules.khong_co.why' })).toBe('rules.khong_co.why');
  });
});
