import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(s: string): string[] {
  // Chỉ biến ICU thật: `{ten}` hoặc `{ten, number|plural|select…}` (không tính chữ trong nhánh select).
  return [...new Set([...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]!))].sort();
}

describe('i18n vi/en', () => {
  it('hai ngôn ngữ có cùng tập khóa', () => {
    const vk = keys(vi).sort();
    const ek = keys(en).sort();
    expect(vk.filter((k) => !ek.includes(k))).toEqual([]);
    expect(ek.filter((k) => !vk.includes(k))).toEqual([]);
  });

  it('cùng biến nội suy ở mỗi chuỗi', () => {
    const get = (o: unknown, path: string) =>
      path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o);
    for (const k of keys(vi)) {
      const a = get(vi, k);
      const b = get(en, k);
      if (typeof a === 'string' && typeof b === 'string') {
        expect(placeholders(a), k).toEqual(placeholders(b));
      }
    }
  });

  it('không chuỗi rỗng', () => {
    const get = (o: unknown, path: string) =>
      path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o);
    for (const k of keys(vi)) {
      expect(String(get(vi, k)).trim(), `vi.${k}`).not.toBe('');
      expect(String(get(en, k)).trim(), `en.${k}`).not.toBe('');
    }
  });

  it('giao diện khách không lộ tên cờ hay mã giai đoạn (CLAUDE.md quy tắc 7)', () => {
    const text = JSON.stringify(vi) + JSON.stringify(en);
    expect(text).not.toMatch(/p0_reports|p1_recommendations|p2a_approve|p2b_auto/);
    expect(text).not.toMatch(/\bP[0-3][ab]?\b/);
  });
});
