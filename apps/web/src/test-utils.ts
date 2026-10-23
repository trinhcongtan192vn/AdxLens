// Chỉ dùng trong test: gọi Route Handler trực tiếp với user giả.
import type { Db } from '@adxlens/db';
import type { PayosApi, StripeApi } from '@adxlens/core/billing';
import { setPayosForTests } from '@/server/payos';
import { setQueueAdminForTests } from '@/server/queue-admin';
import type { FailedJob, QueueAdmin } from '@adxlens/core/ops';
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

/** PayOS giả: đơn nào cũng PAID với số tiền đã tạo (hoặc trạng thái đặt sẵn). */
/** Hàng đợi giả cho trang vận hành: job lỗi đặt sẵn theo queue; ghi lại thao tác. */
export function fakeQueues(failed: Record<string, FailedJob[]> = {}): QueueAdmin & { calls: string[] } {
  const calls: string[] = [];
  const take = (q: string, id: string) => {
    const list = failed[q] ?? [];
    const i = list.findIndex((j) => j.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  };
  return {
    calls,
    counts: async () =>
      Object.entries(failed).map(([queue, jobs]) => ({
        queue,
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: jobs.length,
      })),
    failed: async (q, limit) => (failed[q] ?? []).slice(0, limit),
    retry: async (q, id) => (calls.push(`retry ${q}:${id}`), take(q, id)),
    remove: async (q, id) => (calls.push(`remove ${q}:${id}`), take(q, id)),
  };
}

export function fakePayos() {
  const links = new Map<number, bigint>();
  const status = new Map<number, string>();
  const api: PayosApi & { links: typeof links; status: typeof status } = {
    links,
    status,
    async createPaymentLink(p) {
      links.set(p.orderCode, p.amount);
      return { checkoutUrl: `https://pay.payos.test/${p.orderCode}`, paymentLinkId: `pl_${p.orderCode}` };
    },
    async getPaymentStatus(orderCode) {
      return { status: status.get(orderCode) ?? 'PENDING', amount: links.get(orderCode) ?? 0n };
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
  const payos = fakePayos();
  setPayosForTests(payos);
  const queues = fakeQueues();
  setQueueAdminForTests(queues);
  return { enqueue, email, storage, rateLimiter, stripe, payos, queues };
}

export function uninstallTestServer() {
  setDepsForTest(null);
  setAuthResolverForTest(null);
  setPasswordVerifierForTest(null);
  setAccountOpsForTest(null);
  setStripeForTests(null);
  setPayosForTests(null);
  setQueueAdminForTests(null);
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
