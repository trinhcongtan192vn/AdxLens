import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import {
  buildStamp,
  DEFAULT_PM,
  devPublicConfig,
  envValue,
  fillSupabaseKeys,
  missingSupabaseKeys,
  parseFrom,
  parseStatusEnv,
  supabaseEnvFile,
} from './start-local.mjs';

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

const PUBLIC = [
  'PUBLIC_DEV_APP_URL=https://adxlens-dev.sctech.io.vn/',
  'PUBLIC_DEV_SUPABASE_URL=https://adxlens-dev-sb.sctech.io.vn',
  'PM_EMAIL=Tan@SCTech.io.vn',
  'PM_PASSWORD=Mat-khau-rieng-2026',
  'EMAIL_FROM="AdxLens <no-reply@notify.sctech.io.vn>"',
  'SMTP_HOST=smtp.resend.com',
  'SMTP_PORT=465',
  'SMTP_USER=resend',
  'SMTP_PASS=re_test_key',
  '',
].join('\n');

describe('dev công khai (docs/runbooks/dev-public.md)', () => {
  it('không có PUBLIC_DEV_APP_URL → localhost, PM mặc định, không lỗi', () => {
    const c = devPublicConfig('SMTP_HOST=127.0.0.1\n');
    expect(c).toMatchObject({
      isPublic: false,
      appUrl: 'http://localhost:3000',
      supabasePublicUrl: 'http://127.0.0.1:54321',
      pmEmail: DEFAULT_PM.email,
      pmPasswordIsDefault: true,
      problems: [],
    });
  });

  it('cấu hình đủ → URL bỏ dấu / cuối, email PM chữ thường, đọc EMAIL_FROM có ngoặc kép', () => {
    const c = devPublicConfig(PUBLIC);
    expect(c).toMatchObject({
      isPublic: true,
      appUrl: 'https://adxlens-dev.sctech.io.vn',
      supabasePublicUrl: 'https://adxlens-dev-sb.sctech.io.vn',
      pmEmail: 'tan@sctech.io.vn',
      pmPasswordIsDefault: false,
      problems: [],
    });
    expect(c.smtp.from).toEqual({ name: 'AdxLens', address: 'no-reply@notify.sctech.io.vn' });
  });

  it('chặn mở ra ngoài khi mật khẩu PM mặc định / ngắn, email .local, SMTP Mailpit, thiếu URL Supabase', () => {
    const bad = devPublicConfig('PUBLIC_DEV_APP_URL=http://adxlens-dev.sctech.io.vn\nPM_PASSWORD=ngan\n');
    expect(bad.problems).toHaveLength(6);
    const defaultPass = devPublicConfig(
      PUBLIC.replace('PM_PASSWORD=Mat-khau-rieng-2026', `PM_PASSWORD=${DEFAULT_PM.password}`),
    );
    expect(defaultPass.problems).toEqual([expect.stringContaining('PM_PASSWORD')]);
    const mailpit = devPublicConfig(PUBLIC.replace('SMTP_HOST=smtp.resend.com', 'SMTP_HOST=127.0.0.1'));
    expect(mailpit.problems).toEqual([expect.stringContaining('SMTP')]);
  });

  it('infra/supabase/.env: local → Auth localhost, SMTP tắt; công khai → domain dev, SMTP Resend; có thoát ngoặc kép', () => {
    const local = supabaseEnvFile(devPublicConfig(''));
    expect(local).toContain('ADX_AUTH_SITE_URL="http://localhost:3000"');
    expect(local).toContain('ADX_AUTH_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1"');
    expect(local).toContain('ADX_SMTP_ENABLED="false"');
    const pub = supabaseEnvFile(devPublicConfig(PUBLIC.replace('re_test_key', 're_"x\\y')));
    expect(pub).toContain('ADX_AUTH_SITE_URL="https://adxlens-dev.sctech.io.vn"');
    expect(pub).toContain('ADX_AUTH_REDIRECT_URL="https://adxlens-dev.sctech.io.vn/auth/callback"');
    expect(pub).toContain('ADX_AUTH_EXTERNAL_URL="https://adxlens-dev-sb.sctech.io.vn/auth/v1"');
    expect(pub).toContain('ADX_SMTP_ENABLED="true"');
    expect(pub).toContain('ADX_SMTP_HOST="smtp.resend.com"');
    expect(pub).toContain('ADX_SMTP_PASS="re_\\"x\\\\y"');
    expect(pub).toContain('ADX_SMTP_ADMIN_EMAIL="no-reply@notify.sctech.io.vn"');
  });

  it('đọc địa chỉ gửi', () => {
    expect(parseFrom('no-reply@x.vn')).toEqual({ name: '', address: 'no-reply@x.vn' });
    expect(parseFrom('khong hop le')).toBeNull();
  });
});
