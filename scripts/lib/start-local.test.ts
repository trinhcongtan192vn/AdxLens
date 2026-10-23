import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import { buildStamp, envValue, fillSupabaseKeys, missingSupabaseKeys, parseStatusEnv } from './start-local.mjs';

const ENV = [
  'SUPABASE_URL=http://127.0.0.1:54321',
  'SUPABASE_ANON_KEY=',
  'SUPABASE_SERVICE_ROLE_KEY=',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
  'TOKEN_ENC_KEY_V1=giu-nguyen',
  '',
].join('\n');

describe('start-local', () => {
  it('đọc kết quả supabase status -o env', () => {
    expect(parseStatusEnv('ANON_KEY="a1"\r\nSERVICE_ROLE_KEY="s1"\nAPI_URL="http://x"\n')).toEqual({
      ANON_KEY: 'a1',
      SERVICE_ROLE_KEY: 's1',
      API_URL: 'http://x',
    });
  });

  it('điền key Supabase còn trống, không đổi khóa mã hóa token', () => {
    expect(missingSupabaseKeys(ENV)).toHaveLength(3);
    const out = fillSupabaseKeys(ENV, { ANON_KEY: 'a1', SERVICE_ROLE_KEY: 's1' });
    expect(envValue(out, 'SUPABASE_ANON_KEY')).toBe('a1');
    expect(envValue(out, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')).toBe('a1');
    expect(envValue(out, 'SUPABASE_SERVICE_ROLE_KEY')).toBe('s1');
    expect(envValue(out, 'TOKEN_ENC_KEY_V1')).toBe('giu-nguyen');
    expect(missingSupabaseKeys(out)).toEqual([]);
  });

  it('không ghi đè key đã có; thêm dòng nếu thiếu biến', () => {
    const has = 'SUPABASE_ANON_KEY=cu\nTOKEN_ENC_KEY_V1=k\n';
    const out = fillSupabaseKeys(has, { ANON_KEY: 'moi', SERVICE_ROLE_KEY: 's1' });
    expect(envValue(out, 'SUPABASE_ANON_KEY')).toBe('cu');
    expect(envValue(out, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')).toBe('moi');
    expect(envValue(out, 'SUPABASE_SERVICE_ROLE_KEY')).toBe('s1');
  });

  it('dấu build đổi khi commit hoặc code chưa commit đổi; không đọc được git thì luôn build lại', () => {
    const clean = buildStamp('abc123', '');
    expect(buildStamp('abc123', '\n')).toBe(clean);
    expect(buildStamp('def456', '')).not.toBe(clean);
    expect(buildStamp('abc123', ' M apps/web/src/x.tsx')).not.toBe(clean);
    expect(buildStamp('', '')).toBeNull();
  });

  it('không có key từ Supabase thì giữ nguyên nội dung', () => {
    expect(fillSupabaseKeys(ENV, {})).toBe(ENV);
  });
});
