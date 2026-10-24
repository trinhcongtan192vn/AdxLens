// Hàm thuần cho `pnpm start:local` (scripts/start-local.mjs). Tách riêng để test được.

const SUPABASE_KEYS = {
  SUPABASE_ANON_KEY: 'ANON_KEY',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ANON_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY',
};

/** Đọc kết quả `supabase status -o env` thành object. */
export function parseStatusEnv(stdout) {
  return Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Giá trị một biến trong nội dung file env (chuỗi rỗng nếu thiếu). */
export function envValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

/**
 * Dấu phiên bản của bản build web: commit hiện tại + thay đổi chưa commit trong code web/packages. Dấu khác bản
 * build trước → build lại. Không có commit (không đọc được git) → null = luôn build lại.
 */
export function buildStamp(head, statusPorcelain) {
  if (!head) return null;
  return `${head}\n${statusPorcelain.trim()}`;
}

/** Danh sách key Supabase còn trống trong .env.local. */
export function missingSupabaseKeys(text) {
  return Object.keys(SUPABASE_KEYS).filter((k) => !envValue(text, k));
}

/**
 * Điền key Supabase còn trống, KHÔNG đụng biến khác (khóa mã hóa token giữ nguyên — tạo lại sẽ làm token đã lưu
 * không giải mã được). Trả nội dung mới.
 */
export function fillSupabaseKeys(text, vars) {
  let out = text;
  for (const [key, from] of Object.entries(SUPABASE_KEYS)) {
    if (envValue(out, key) || !vars[from]) continue;
    const line = `${key}=${vars[from]}`;
    out = new RegExp(`^${key}=.*$`, 'm').test(out)
      ? out.replace(new RegExp(`^${key}=.*$`, 'm'), line)
      : `${out.replace(/\n?$/, '\n')}${line}\n`;
  }
  return out;
}

/** Tài khoản PM mặc định ở local (chỉ localhost; chế độ dev công khai bắt buộc đổi). */
export const DEFAULT_PM = { email: 'pm@adxlens.local', password: 'AdxLens@local1' };
const LOCAL_APP_URL = 'http://localhost:3000';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

/** Giá trị trong file env, bỏ ngoặc kép / đơn bao quanh. */
function val(text, key) {
  return envValue(text, key).replace(/^(["'])(.*)\1$/, '$2');
}

/** "AdxLens <no-reply@x.vn>" → { name, address }; chỉ địa chỉ → name rỗng. */
export function parseFrom(from) {
  const m = from.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ''), address: m[2] };
  return /^[^\s@]+@[^\s@]+$/.test(from.trim()) ? { name: '', address: from.trim() } : null;
}

/**
 * Cấu hình mở app (docs/runbooks/dev-public.md): `PUBLIC_DEV_APP_URL` có giá trị = chế độ dev công khai (team test qua
 * domain, Cloudflare Tunnel). Trả URL dùng cho app / Supabase, tài khoản PM, SMTP và danh sách lỗi cấu hình phải sửa
 * trước khi mở ra ngoài (mật khẩu PM mặc định, SMTP vẫn là Mailpit…).
 */
export function devPublicConfig(text) {
  const trim = (u) => u.replace(/\/+$/, '');
  const appUrl = trim(val(text, 'PUBLIC_DEV_APP_URL'));
  const sbUrl = trim(val(text, 'PUBLIC_DEV_SUPABASE_URL'));
  const pmEmail = (val(text, 'PM_EMAIL') || DEFAULT_PM.email).toLowerCase();
  const pmPassword = val(text, 'PM_PASSWORD') || DEFAULT_PM.password;
  const smtp = {
    host: val(text, 'SMTP_HOST') || '127.0.0.1',
    port: val(text, 'SMTP_PORT') || '54325',
    user: val(text, 'SMTP_USER'),
    pass: val(text, 'SMTP_PASS'),
    from: parseFrom(val(text, 'EMAIL_FROM') || 'AdxLens <no-reply@adxlens.local>'),
  };
  const isPublic = Boolean(appUrl);
  const problems = [];
  if (isPublic) {
    if (!/^https:\/\/[^/]+$/.test(appUrl))
      problems.push('PUBLIC_DEV_APP_URL phải có dạng https://ten-mien (không có đường dẫn).');
    if (!/^https:\/\/[^/]+$/.test(sbUrl))
      problems.push('PUBLIC_DEV_SUPABASE_URL phải có dạng https://ten-mien (hostname Supabase của tunnel).');
    if (pmPassword === DEFAULT_PM.password || pmPassword.length < 12) {
      problems.push(
        'PM_PASSWORD phải là mật khẩu riêng, ít nhất 12 ký tự (không dùng mật khẩu mặc định khi mở ra ngoài).',
      );
    }
    if (pmEmail.endsWith('.local')) problems.push('PM_EMAIL phải là email thật (vd. tan@sctech.io.vn).');
    if (['127.0.0.1', 'localhost'].includes(smtp.host) || !smtp.pass) {
      problems.push('SMTP còn trỏ về Mailpit: điền SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS của Resend.');
    }
    if (!smtp.from || smtp.from.address.endsWith('.local')) {
      problems.push(
        'EMAIL_FROM phải là địa chỉ trên domain đã xác minh ở Resend (vd. AdxLens <no-reply@notify.sctech.io.vn>).',
      );
    }
  }
  return {
    isPublic,
    appUrl: appUrl || LOCAL_APP_URL,
    supabasePublicUrl: sbUrl || LOCAL_SUPABASE_URL,
    pmEmail,
    pmPassword,
    pmPasswordIsDefault: pmPassword === DEFAULT_PM.password,
    smtp,
    problems,
  };
}

const q = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Nội dung `infra/supabase/.env` cho `env(...)` trong `infra/supabase/config.toml` (Supabase CLI đọc file này khi start).
 * Local: Auth về localhost, email vào Mailpit. Dev công khai: site URL / redirect theo domain dev, link trong email qua
 * hostname Supabase của tunnel, gửi email Auth bằng SMTP thật (Resend). Không đổi gì khác của Supabase.
 */
export function supabaseEnvFile(cfg) {
  const lines = {
    ADX_AUTH_SITE_URL: cfg.appUrl,
    ADX_AUTH_REDIRECT_URL: `${cfg.appUrl}/auth/callback`,
    // Link trong email Auth (xác minh, quên mật khẩu): mặc định của Supabase là API URL + /auth/v1.
    ADX_AUTH_EXTERNAL_URL: `${cfg.supabasePublicUrl}/auth/v1`,
    ADX_SMTP_ENABLED: cfg.isPublic ? 'true' : 'false',
    ADX_SMTP_HOST: cfg.isPublic ? cfg.smtp.host : 'localhost',
    ADX_SMTP_PORT: cfg.isPublic ? cfg.smtp.port : '2500',
    ADX_SMTP_USER: cfg.isPublic ? cfg.smtp.user || 'none' : 'none',
    ADX_SMTP_PASS: cfg.isPublic ? cfg.smtp.pass : 'none',
    ADX_SMTP_ADMIN_EMAIL: cfg.isPublic && cfg.smtp.from ? cfg.smtp.from.address : 'no-reply@adxlens.local',
    ADX_SMTP_SENDER_NAME: (cfg.isPublic && cfg.smtp.from?.name) || 'AdxLens',
  };
  return (
    '# Sinh tự động bởi scripts/start-local.mjs / scripts/supabase-env.mjs — không sửa tay, không commit.\n' +
    Object.entries(lines)
      .map(([k, v]) => `${k}=${q(v)}`)
      .join('\n') +
    '\n'
  );
}
