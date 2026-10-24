import { describe, expect, it } from 'vitest';
import { sortAgencyRows } from './agency';

describe('bảng Agency trang chủ Workspace', () => {
  it('khách lệch mục tiêu trước, rồi sức khỏe thấp, rồi tên', () => {
    const rows = sortAgencyRows([
      { name: 'B', health: 90, vsTargetPct: null },
      { name: 'A', health: 50, vsTargetPct: null },
      { name: 'C', health: 95, vsTargetPct: -20 },
      { name: 'D', health: 40, vsTargetPct: 10 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['C', 'A', 'B', 'D']);
  });
});
