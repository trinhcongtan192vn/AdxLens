import 'server-only';
import { supabaseServer } from './supabase';

export type AuthUser = { id: string; email: string; emailConfirmed: boolean };

type Resolver = (req?: Request) => Promise<AuthUser | null>;

/** Lấy user từ phiên Supabase: cookie (web) hoặc `Authorization: Bearer <jwt>` (API, L3 10.1). */
const supabaseResolver: Resolver = async (req) => {
  const supabase = await supabaseServer();
  const bearer = req?.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
};

let resolver: Resolver = supabaseResolver;

export function getAuthUser(req?: Request): Promise<AuthUser | null> {
  return resolver(req);
}

type PasswordVerifier = (email: string, password: string) => Promise<boolean>;

const supabaseVerifier: PasswordVerifier = async (email, password) => {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
};
let verifier: PasswordVerifier = supabaseVerifier;

/** Xác nhận lại mật khẩu cho thao tác nhạy cảm (chuyển quyền owner). */
export function verifyPassword(email: string, password: string): Promise<boolean> {
  return verifier(email, password);
}

export function setPasswordVerifierForTest(v: PasswordVerifier | null): void {
  if (process.env.APP_ENV !== 'test') throw new Error('setPasswordVerifierForTest chỉ dùng trong test');
  verifier = v ?? supabaseVerifier;
}

/**
 * Chỉ cho test: thay nguồn xác thực. Bị chặn ngoài APP_ENV=test để không thể thành đường vòng
 * xác thực trên staging/production.
 */
export function setAuthResolverForTest(r: Resolver | null): void {
  if (process.env.APP_ENV !== 'test') throw new Error('setAuthResolverForTest chỉ dùng trong test');
  resolver = r ?? supabaseResolver;
}
