// Chỉ dùng trong test: gọi Route Handler trực tiếp với user giả.
import type { Db } from '@adxlens/db';
import type { StripeApi } from '@adxlens/core/billing';
import { setStripeForTests } from '@/server/stripe';
import { memoryEmailSender } from '@adxlens/core/notification';
import { recordingEnqueue } from '@adxlens/jobs';
import { setAuthResolverForTest, setPasswordVerifierForTest, type AuthUser } from './server/auth';
import { setAccountOpsForTest } from './server/account';
import { setDepsForTest } from './server/deps';
import { memoryRateLimiter } from './server/rate-limit';
import { memoryStorage } from './server/storage';
import type { RouteHandler } from './server/route';

const users = new Map<string, AuthUser>();

/** Bật chế độ test: user lấy từ header `x-test-user`, DB test, enqueue ghi lại. */
/** Stripe giả cho test route: ghi lại lời gọi, không gọi mạng. */
export function fakeStripe() {
  const calls: { op: string; args: unknown }[] = [];
  const api: StripeApi & { calls: typeof calls } = {
    calls,
    async createCheckoutSession(p) {
      calls.push({ op: 'checkout', args: p });
      return { id: 'cs_test', url: 'https://checkout.stripe.test/cs_test' };
    },
    async createPortalSession(p) {
      calls.push({ op: 'portal', args: p });
      return { url: 'https://billing.stripe.test/portal' };
    },
    async setCancelAtPeriodEnd(id, cancel) {
      calls.push({ op: 'cancel', args: { id, cancel } });
    },
  };
  return api;
}

export function installTestServer(db: Db) {
  const enqueue = recordingEnqueue();
  const email = memoryEmailSender();
  const storage = memoryStorage();
  const rateLimiter = memoryRateLimiter();
  setDepsForTest({ db, enqueue, email, storage, rateLimiter });
  setAuthResolverForTest(async (req) => {
    const id = req?.headers.get('x-test-user');
    return id ? (users.get(id) ?? null) : null;
  });
  // Mật khẩu đúng trong test là "correct-password".
  setPasswordVerifierForTest(async (_email, password) => password === 'correct-password');
  setAccountOpsForTest({ changePassword: async () => ({ ok: true }), signOutOthers: async () => {} });
  const stripe = fakeStripe();
  setStripeForTests(stripe);
  return { enqueue, email, storage, rateLimiter, stripe };
}

export function uninstallTestServer() {
  setDepsForTest(null);
  setAuthResolverForTest(null);
  setPasswordVerifierForTest(null);
  setAccountOpsForTest(null);
  setStripeForTests(null);
  users.clear();
}

export function asUser(u: { id: string; email: string }, emailConfirmed = true): AuthUser {
  const au = { id: u.id, email: u.email, emailConfirmed };
  users.set(u.id, au);
  return au;
}

export async function call(
  handler: RouteHandler,
  opts: {
    method?: string;
    path?: string;
    user?: { id: string } | null;
    workspaceId?: string;
    body?: unknown;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const headers = new Headers(opts.headers);
  if (opts.user) headers.set('x-test-user', opts.user.id);
  if (opts.workspaceId) headers.set('x-workspace-id', opts.workspaceId);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const req = new Request(`http://localhost${opts.path ?? '/api/test'}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* giữ text */
  }
  return { status: res.status, body, headers: res.headers };
}
