import { describe, expect, it } from 'vitest';
import { assignBody, decodeChoice, defaultChoice, encodeChoice, isNameMatch } from './assign';

describe('S05 lựa chọn Client', () => {
  it('chọn sẵn Client đã gợi ý; không có thì tạo mới theo tên gợi ý', () => {
    expect(defaultChoice({ clientId: 'c1', suggestedClientName: null, assignmentStatus: 'suggested' })).toEqual({
      kind: 'existing',
      clientId: 'c1',
    });
    expect(defaultChoice({ clientId: null, suggestedClientName: ' Linh ', assignmentStatus: 'suggested' })).toEqual({
      kind: 'new',
      name: 'Linh',
    });
    expect(defaultChoice({ clientId: null, suggestedClientName: null, assignmentStatus: 'suggested' })).toEqual({
      kind: 'none',
    });
  });

  it('"Khớp tên" chỉ khi gợi ý trúng Client có sẵn và chưa xác nhận', () => {
    expect(isNameMatch({ clientId: 'c1', suggestedClientName: null, assignmentStatus: 'suggested' })).toBe(true);
    expect(isNameMatch({ clientId: 'c1', suggestedClientName: null, assignmentStatus: 'confirmed' })).toBe(false);
    expect(isNameMatch({ clientId: null, suggestedClientName: 'X', assignmentStatus: 'suggested' })).toBe(false);
  });

  it('mã hóa/giải mã giá trị select và dựng body API', () => {
    for (const c of [
      { kind: 'existing', clientId: 'id-1' },
      { kind: 'new', name: 'Shop: A' },
    ] as const) {
      expect(decodeChoice(encodeChoice(c))).toEqual(c);
    }
    expect(decodeChoice('')).toEqual({ kind: 'none' });
    expect(decodeChoice('n:  ')).toEqual({ kind: 'none' });
    expect(assignBody({ kind: 'existing', clientId: 'x' })).toEqual({ client_id: 'x' });
    expect(assignBody({ kind: 'new', name: 'A' })).toEqual({ create_client_name: 'A' });
    expect(assignBody({ kind: 'none' })).toBeNull();
  });
});
