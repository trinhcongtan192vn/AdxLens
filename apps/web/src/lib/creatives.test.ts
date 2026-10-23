import { describe, expect, it } from 'vitest';
import { parseCompareIds } from './creatives';

describe('parseCompareIds', () => {
  it('nhận tham số lặp hoặc dấu phẩy, bỏ trùng và giá trị lạ, tối đa 4', () => {
    expect(parseCompareIds(['1', '2', '2'])).toEqual(['1', '2']);
    expect(parseCompareIds('1,2,3,4,5')).toEqual(['1', '2', '3', '4']);
    expect(parseCompareIds(['1', "x'; drop", ''])).toEqual(['1']);
    expect(parseCompareIds(undefined)).toEqual([]);
  });
});
