import { z } from 'zod';

/**
 * Luồng xác thực (ADR-0003) tách khỏi Supabase để test: không tiết lộ email đã tồn tại, lỗi đăng
 * nhập chung chung, chuyển hướng chỉ nội bộ.
 */
export type AuthProvider = {
  signUp(input: { email: string; password: string; fullName: string; redirectTo: string }): Promise<{
    error: { code?: string; status?: number } | null;
  }>;
  signIn(input: { email: string; password: string }): Promise<{
    error: { code?: string; status?: number } | null;
    emailConfirmed?: boolean;
  }>;
  resendVerification(input: { email: string; redirectTo: string }): Promise<{ error: unknown }>;
  sendPasswordReset(input: { email: string; redirectTo: string }): Promise<{ error: unknown }>;
  updatePassword(input: { password: string }): Promise<{ error: { code?: string } | null }>;
};

export type FormState =
  | { status: 'idle' }
  | { status: 'ok'; next?: string }
  | {
      status: 'error';
      code: AuthErrorCode;
      fields?: Record<string, string>;
      /** invalid_credentials: số lần thử còn lại; locked: số phút còn khóa. */
      remaining?: number;
      minutesLeft?: number;
    };

export type AuthErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'locked'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'terms_required'
  | 'email_exists'
  | 'link_expired'
  | 'rate_limited'
  | 'unknown';

/** Bộ đếm đăng nhập sai (core/tenancy auth-throttle). */
export type LoginThrottle = {
  state(email: string): Promise<{ locked: false; remaining: number } | { locked: true; minutesLeft: number }>;
  fail(email: string): Promise<{ locked: false; remaining: number } | { locked: true; minutesLeft: number }>;
  clear(email: string): Promise<void>;
};

/** Penpot A01/A05: "Tối thiểu 10 ký tự". Đồng bộ với infra/supabase/config.toml. */
export const MIN_PASSWORD = 10;

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(MIN_PASSWORD).max(128);

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email,
  password,
  acceptTerms: z.literal(true),
});
export const signInSchema = z.object({ email, password: z.string().min(1).max(128) });
export const emailSchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'mismatch' });

function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? 'form');
    out[k] ??= i.code === 'too_small' ? 'too_short' : i.message === 'mismatch' ? 'mismatch' : 'invalid';
  }
  return out;
}

/** Penpot A05: liên kết đặt lại mật khẩu chỉ hiệu lực 60 phút (link xác minh email: 24 giờ). */
export const RESET_LINK_MINUTES = 60;

export function isRecoveryWindowOpen(recoverySentAt: string | null | undefined, now = new Date()): boolean {
  if (!recoverySentAt) return false;
  const sent = Date.parse(recoverySentAt);
  return Number.isFinite(sent) && now.getTime() - sent <= RESET_LINK_MINUTES * 60_000;
}

/** Chỉ cho phép đường dẫn nội bộ: bắt đầu bằng "/" nhưng không phải "//" hay "/\". */
export function safeNext(next: string | null | undefined, fallback = '/overview'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

function isRateLimited(err: { code?: string; status?: number } | null | undefined): boolean {
  return err?.status === 429 || err?.code === 'over_email_send_rate_limit' || err?.code === 'over_request_rate_limit';
}

/**
 * Đăng ký. Email đã có tài khoản → báo "email đã có tài khoản" theo Penpot "A01 · lỗi" (PM chốt
 * 23/10/2026, ADR-0003 mục 3, thay yêu cầu "không tiết lộ" ở PROMPTS mốc L).
 */
export async function signUpFlow(p: AuthProvider, raw: unknown, appUrl: string): Promise<FormState> {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    const code: AuthErrorCode = fields.password
      ? 'weak_password'
      : fields.acceptTerms
        ? 'terms_required'
        : 'invalid_input';
    return { status: 'error', code, fields };
  }
  const { fullName, email: em, password: pw } = parsed.data;
  const { error } = await p.signUp({
    fullName,
    email: em,
    password: pw,
    redirectTo: `${appUrl}/auth/callback`,
  });
  if (error?.code === 'weak_password') return { status: 'error', code: 'weak_password', fields: { password: 'weak' } };
  if (error?.code === 'user_already_exists' || error?.code === 'email_exists') {
    return { status: 'error', code: 'email_exists', fields: { email: 'exists' } };
  }
  if (isRateLimited(error)) return { status: 'error', code: 'rate_limited' };
  return { status: 'ok' };
}

/**
 * Đăng nhập: sai email hay sai mật khẩu đều cùng một lỗi, kèm số lần thử còn lại; 5 lần sai → khóa
 * 15 phút (Penpot A03 · lỗi). Bộ đếm áp như nhau cho mọi email nên không tiết lộ email tồn tại.
 */
export async function signInFlow(
  p: AuthProvider,
  raw: unknown,
  next?: string | null,
  throttle?: LoginThrottle,
): Promise<FormState> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { status: 'error', code: 'invalid_credentials' };
  const em = parsed.data.email;
  const before = await throttle?.state(em);
  if (before?.locked) return { status: 'error', code: 'locked', minutesLeft: before.minutesLeft };
  const r = await p.signIn(parsed.data);
  if (r.error) {
    if (r.error.code === 'email_not_confirmed') return { status: 'error', code: 'email_not_confirmed' };
    if (isRateLimited(r.error)) return { status: 'error', code: 'rate_limited' };
    const after = await throttle?.fail(em);
    if (after?.locked) return { status: 'error', code: 'locked', minutesLeft: after.minutesLeft };
    return { status: 'error', code: 'invalid_credentials', remaining: after?.remaining };
  }
  await throttle?.clear(em);
  return { status: 'ok', next: safeNext(next) };
}

/** Quên mật khẩu: luôn báo đã gửi (nếu email tồn tại), không tiết lộ. */
export async function forgotPasswordFlow(p: AuthProvider, raw: unknown, appUrl: string): Promise<FormState> {
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { status: 'error', code: 'invalid_input', fields: { email: 'invalid' } };
  await p.sendPasswordReset({
    email: parsed.data.email,
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });
  return { status: 'ok' };
}

export async function resendVerificationFlow(p: AuthProvider, raw: unknown, appUrl: string): Promise<FormState> {
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { status: 'error', code: 'invalid_input', fields: { email: 'invalid' } };
  await p.resendVerification({ email: parsed.data.email, redirectTo: `${appUrl}/auth/callback` });
  return { status: 'ok' };
}

export async function resetPasswordFlow(p: AuthProvider, raw: unknown): Promise<FormState> {
  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return { status: 'error', code: fields.password ? 'weak_password' : 'invalid_input', fields };
  }
  const { error } = await p.updatePassword({ password: parsed.data.password });
  if (error) {
    if (error.code === 'weak_password') return { status: 'error', code: 'weak_password', fields: { password: 'weak' } };
    return { status: 'error', code: 'link_expired' };
  }
  return { status: 'ok', next: '/overview' };
}
