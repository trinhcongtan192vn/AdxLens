import { describe, expect, it } from 'vitest';
import { PLAN_KEYS } from '@adxlens/core/billing';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import { lookupDeletionStatus } from '../../server/deletion-status';

describe('trang công khai', () => {
  it('mọi gói trong cấu hình có tên và mô tả ở cả hai ngôn ngữ', () => {
    for (const key of PLAN_KEYS) {
      for (const m of [vi, en]) {
        const plan = (m.marketing.pricing.plans as Record<string, { name: string; summary: string }>)[key];
        expect(plan?.name, key).toBeTruthy();
        expect(plan?.summary, key).toBeTruthy();
      }
    }
  });

  it('bảng giá không hard-code số tiền trong chuỗi giao diện (giá đọc từ cấu hình)', () => {
    expect(JSON.stringify(vi.marketing.pricing)).not.toMatch(/\d{3}\.\d{3}/);
    expect(JSON.stringify(en.marketing.pricing)).not.toMatch(/\d{3},\d{3}/);
  });

  it('tra mã xóa dữ liệu sai định dạng trả "không tìm thấy"', async () => {
    expect(await lookupDeletionStatus("'; drop table x; --")).toBeNull();
    expect(await lookupDeletionStatus('')).toBeNull();
  });
});
