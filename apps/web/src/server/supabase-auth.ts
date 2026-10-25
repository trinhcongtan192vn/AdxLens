import 'server-only';
import { clearLoginFailures, loginThrottleState, recordLoginFailure } from '@adxlens/core/tenancy';
import { isRecoveryWindowOpen, type AuthProvider, type LoginThrottle } from './auth-flows';
import { deps } from './deps';
import { supabaseServer } from './supabase';

/** AuthProvider thật: Supabase Auth với phiên cookie (ADR-0003). */
export async function supabaseAuthProvider(): Promise<AuthProvider> {
  const sb = await supabaseServer();
  return {
    async signUp({ email, password, fullName, redirectTo }) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo, data: { full_name: fullName } },
      });
      if (error) return { error: { code: error.code, status: error.status } };
      // Khi bật xác minh email, Supabase không báo lỗi cho email đã có tài khoản mà trả user
      // với identities rỗng.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        return { error: { code: 'user_already_exists', status: 422 } };
      }
      return { error: null };
    },
    async signIn({ email, password }) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return { error: error ? { code: error.code, status: error.status } : null };
    },
    async resendVerification({ email, redirectTo }) {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectTo },
      });
      return { error };
    },
    async sendPasswordReset({ email, redirectTo }) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      return { error };
    },
    async updatePassword({ password }) {
      const { data } = await sb.auth.getUser();
      if (!data.user || !isRecoveryWindowOpen(data.user.recovery_sent_at)) {
        return { error: { code: 'session_not_found' } };
      }
      const { error } = await sb.auth.updateUser({ password });
      if (error) return { error: { code: error.code } };
      // Penpot A05: đặt lại xong, mọi phiên đăng nhập cũ bị đăng xuất.
      await sb.auth.signOut({ scope: 'others' });
      return { error: null };
    },
  };
}

/** Trang A05: còn trong cửa sổ 60 phút sau khi gửi link đặt lại không. */
export async function canResetPassword(): Promise<boolean> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return Boolean(data.user && isRecoveryWindowOpen(data.user.recovery_sent_at));
}

export function dbLoginThrottle(): LoginThrottle {
  const { db } = deps();
  return {
    state: (email) => loginThrottleState(db, email),
    fail: (email) => recordLoginFailure(db, email),
    clear: (email) => clearLoginFailures(db, email),
  };
}
