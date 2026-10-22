import { describe, expect, it, vi } from 'vitest';
import {
  forgotPasswordFlow,
  isRecoveryWindowOpen,
  resetPasswordFlow,
  safeNext,
  signInFlow,
  signUpFlow,
  type AuthProvider,
  type LoginThrottle,
} from './auth-flows';

function provider(over: Partial<AuthProvider> = {}): AuthProvider {
  return {
    signUp: vi.fn(async () => ({ error: null })),
    signIn: vi.fn(async () => ({ error: null })),
    resendVerification: vi.fn(async () => ({ error: null })),
    sendPasswordReset: vi.fn(async () => ({ error: null })),
    updatePassword: vi.fn(async () => ({ error: null })),
    ...over,
  };
}

const APP = 'http://localhost:3000';
const good = {
  fullName: 'Trịnh Công Tân',
  email: 'Tan@SaoMai.vn',
  password: 'mat-khau-dai',
  acceptTerms: true,
};

function memoryThrottle(): LoginThrottle {
  const fails = new Map<string, number>();
  const locked = new Set<string>();
  return {
    state: async (e) =>
      locked.has(e) ? { locked: true, minutesLeft: 15 } : { locked: false, remaining: 5 - (fails.get(e) ?? 0) },
    fail: async (e) => {
      const n = (fails.get(e) ?? 0) + 1;
      fails.set(e, n);
      if (n >= 5) {
        locked.add(e);
        return { locked: true, minutesLeft: 15 };
      }
      return { locked: false, remaining: 5 - n };
    },
    clear: async (e) => {
      fails.delete(e);
    },
  };
}

describe('đăng ký (A01)', () => {
  it('chuẩn hóa email và đặt redirect về callback', async () => {
    const p = provider();
    expect(await signUpFlow(p, good, APP)).toEqual({ status: 'ok' });
    expect(p.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'tan@saomai.vn', redirectTo: `${APP}/auth/callback` }),
    );
  });

  it('email đã tồn tại vẫn trả cùng kết quả như email mới (không tiết lộ)', async () => {
    const existing = provider({
      signUp: async () => ({ error: { code: 'user_already_exists', status: 422 } }),
    });
    const fresh = provider();
    expect(await signUpFlow(existing, good, APP)).toEqual(await signUpFlow(fresh, good, APP));
  });

  it('mật khẩu ngắn hơn 10 ký tự bị từ chối trước khi gọi Supabase', async () => {
    const p = provider();
    const r = await signUpFlow(p, { ...good, password: '123456789' }, APP);
    expect(r).toMatchObject({ status: 'error', code: 'weak_password' });
    expect(p.signUp).not.toHaveBeenCalled();
  });

  it('bắt buộc đồng ý điều khoản', async () => {
    const p = provider();
    expect(await signUpFlow(p, { ...good, acceptTerms: false }, APP)).toMatchObject({
      status: 'error',
      code: 'terms_required',
    });
    expect(p.signUp).not.toHaveBeenCalled();
  });

  it('email sai định dạng', async () => {
    expect(await signUpFlow(provider(), { ...good, email: 'x' }, APP)).toMatchObject({
      status: 'error',
      fields: { email: 'invalid' },
    });
  });
});

describe('đăng nhập (A03)', () => {
  it('sai email hay sai mật khẩu cùng một lỗi chung', async () => {
    const p = provider({
      signIn: async () => ({ error: { code: 'invalid_credentials', status: 400 } }),
    });
    const a = await signInFlow(p, { email: 'a@b.vn', password: 'x' });
    const b = await signInFlow(p, { email: 'khongco@b.vn', password: 'y' });
    expect(a).toEqual({ status: 'error', code: 'invalid_credentials' });
    expect(b).toEqual(a);
  });

  it('báo số lần thử còn lại; lần thứ 5 khóa 15 phút; khi khóa không gọi Supabase', async () => {
    const signIn = vi.fn(async () => ({ error: { code: 'invalid_credentials', status: 400 } }));
    const p = provider({ signIn });
    const th = memoryThrottle();
    const creds = { email: 'a@b.vn', password: 'sai' };
    expect(await signInFlow(p, creds, null, th)).toMatchObject({
      code: 'invalid_credentials',
      remaining: 4,
    });
    for (let i = 0; i < 3; i++) await signInFlow(p, creds, null, th);
    expect(await signInFlow(p, creds, null, th)).toMatchObject({ code: 'locked', minutesLeft: 15 });
    const calls = signIn.mock.calls.length;
    expect(await signInFlow(p, { ...creds, password: 'dung' }, null, th)).toMatchObject({
      code: 'locked',
    });
    expect(signIn.mock.calls.length).toBe(calls);
  });

  it('chưa xác minh email', async () => {
    const p = provider({ signIn: async () => ({ error: { code: 'email_not_confirmed' } }) });
    expect(await signInFlow(p, { email: 'a@b.vn', password: 'x' })).toMatchObject({
      code: 'email_not_confirmed',
    });
  });

  it('chuyển tới next nội bộ; next ngoài bị thay bằng mặc định', async () => {
    expect(await signInFlow(provider(), { email: 'a@b.vn', password: 'x' }, '/clients')).toEqual({
      status: 'ok',
      next: '/clients',
    });
    expect(await signInFlow(provider(), { email: 'a@b.vn', password: 'x' }, 'https://evil.example')).toEqual({
      status: 'ok',
      next: '/overview',
    });
  });
});

describe('quên và đặt lại mật khẩu (A04, A05)', () => {
  it('quên mật khẩu luôn báo đã gửi', async () => {
    const p = provider({ sendPasswordReset: async () => ({ error: { code: 'user_not_found' } }) });
    expect(await forgotPasswordFlow(p, { email: 'khongco@b.vn' }, APP)).toEqual({ status: 'ok' });
  });

  it('mật khẩu xác nhận không khớp', async () => {
    expect(await resetPasswordFlow(provider(), { password: 'mat-khau-moi', confirm: 'khac-nhau' })).toMatchObject({
      status: 'error',
      fields: { confirm: 'mismatch' },
    });
  });

  it('link hết hạn (không có phiên) → trạng thái hết hạn', async () => {
    const p = provider({ updatePassword: async () => ({ error: { code: 'session_not_found' } }) });
    expect(await resetPasswordFlow(p, { password: 'mat-khau-moi', confirm: 'mat-khau-moi' })).toMatchObject({
      code: 'link_expired',
    });
  });
});

describe('cửa sổ đặt lại mật khẩu 60 phút (A05)', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  it('còn hạn trong 60 phút, hết hạn sau đó, thiếu thời điểm gửi coi là hết hạn', () => {
    expect(isRecoveryWindowOpen('2026-10-22T09:01:00Z', now)).toBe(true);
    expect(isRecoveryWindowOpen('2026-10-22T08:59:00Z', now)).toBe(false);
    expect(isRecoveryWindowOpen(null, now)).toBe(false);
    expect(isRecoveryWindowOpen('rác', now)).toBe(false);
  });
});

describe('safeNext', () => {
  it.each([
    ['/clients?x=1', '/clients?x=1'],
    ['//evil.example', '/overview'],
    ['/\\evil.example', '/overview'],
    ['https://evil.example', '/overview'],
    ['javascript:alert(1)', '/overview'],
    ['/ok\r\nSet-Cookie: x', '/overview'],
    [null, '/overview'],
  ])('%s → %s', (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});
