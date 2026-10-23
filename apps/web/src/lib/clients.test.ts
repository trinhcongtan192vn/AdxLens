import { describe, expect, it } from 'vitest';
import { filterClients, type ClientRow } from './clients';

const rows: ClientRow[] = [
  {
    id: '1',
    name: 'Thời trang Linh',
    accounts: [{ id: 'a', name: 'Linh Shop 01', metaAccountId: 'act_100000001', confirmed: true, expired: false }],
  },
  {
    id: '2',
    name: 'Đồ gỗ An',
    accounts: [{ id: 'b', name: 'An Furniture', metaAccountId: 'act_200000002', confirmed: false, expired: false }],
  },
];

describe('C01 tìm Client', () => {
  it('rỗng → giữ nguyên', () => {
    expect(filterClients(rows, '  ')).toEqual(rows);
  });
  it('không phân biệt dấu và hoa thường, gồm cả đ', () => {
    expect(filterClients(rows, 'thoi TRANG').map((r) => r.id)).toEqual(['1']);
    expect(filterClients(rows, 'do go').map((r) => r.id)).toEqual(['2']);
  });
  it('khớp tên hoặc ID tài khoản QC', () => {
    expect(filterClients(rows, 'furniture').map((r) => r.id)).toEqual(['2']);
    expect(filterClients(rows, '100000001').map((r) => r.id)).toEqual(['1']);
    expect(filterClients(rows, 'không có')).toEqual([]);
  });
});
