import { z } from 'zod';
import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MetaApiError } from './errors';
import { GRAPH_BASE, MetaHttp } from './http';
import { MetaLimiter } from './limiter';
import { exchangeLongLived } from './oauth';
import { HttpMetaRead } from './read';
import type { MetaCallAudit } from './types';

const V = 'v24.0';
const TOKEN = 'EAAGm0PX4ZCpsBAKZCZBZCZCxyzSECRETTOKEN0001';
const base = `${GRAPH_BASE}/${V}`;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(extra: Partial<ConstructorParameters<typeof MetaHttp>[0]> = {}) {
  const audits: MetaCallAudit[] = [];
  const sleeps: number[] = [];
  const http = new MetaHttp({
    apiVersion: V,
    appSecret: 'app-secret',
    onAudit: (a) => void audits.push(a),
    sleep: async (ms) => void sleeps.push(ms),
    ...extra,
  });
  return { http, read: new HttpMetaRead(http), audits, sleeps };
}

const account = (id: number) => ({
  id: `act_${id}`,
  name: `Acc ${id}`,
  currency: 'VND',
  timezone_name: 'Asia/Ho_Chi_Minh',
});

describe('MetaHttp', () => {
  it('duyệt hết các trang theo paging.next, gắn appsecret_proof, không để token cũ trong URL next', async () => {
    const seen: URL[] = [];
    server.use(
      mswHttp.get(`${base}/me/adaccounts`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        if (url.searchParams.get('after') === 'p2') return HttpResponse.json({ data: [account(3)] });
        return HttpResponse.json({
          data: [account(1), account(2)],
          paging: { next: `${base}/me/adaccounts?after=p2&access_token=OLD_TOKEN_IN_NEXT`, cursors: { after: 'p2' } },
        });
      }),
    );
    const { read } = client();
    const accounts = await read.listAdAccounts(TOKEN);
    expect(accounts.map((a) => a.id)).toEqual(['act_1', 'act_2', 'act_3']);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.searchParams.get('access_token')).toBe(TOKEN);
    expect(seen.every((u) => u.searchParams.get('appsecret_proof')?.length === 64)).toBe(true);
  });

  it('retry khi bị rate limit (mã 17), chờ lâu hơn, rồi thành công', async () => {
    let calls = 0;
    server.use(
      mswHttp.get(`${base}/me`, () => {
        calls++;
        if (calls < 3)
          return HttpResponse.json({ error: { message: 'User request limit reached', code: 17 } }, { status: 400 });
        return HttpResponse.json({ id: 'u1' });
      }),
    );
    const { read, sleeps, audits } = client({ baseDelayMs: 100 });
    expect(await read.me(TOKEN)).toMatchObject({ id: 'u1' });
    expect(calls).toBe(3);
    expect(sleeps[0]).toBeGreaterThanOrEqual(400);
    expect(audits.map((a) => a.errorCode)).toEqual([17, 17, null]);
  });

  it('retry lỗi 5xx tối đa 5 lần rồi ném lỗi', async () => {
    server.use(mswHttp.get(`${base}/me`, () => HttpResponse.json({}, { status: 503 })));
    const { read, audits } = client();
    await expect(read.me(TOKEN)).rejects.toBeInstanceOf(MetaApiError);
    expect(audits).toHaveLength(5);
  });

  it('token hết hạn (190) không retry; thông điệp lỗi không chứa token', async () => {
    server.use(
      mswHttp.get(`${base}/me`, () =>
        HttpResponse.json(
          {
            error: {
              message: `Invalid OAuth access token ${TOKEN} ?access_token=${TOKEN}`,
              code: 190,
              type: 'OAuthException',
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { read, audits } = client();
    const err = (await read.me(TOKEN).catch((e: unknown) => e)) as MetaApiError;
    expect(err.isTokenInvalid).toBe(true);
    expect(audits).toHaveLength(1);
    expect(err.message).not.toContain(TOKEN);
    expect(JSON.stringify(audits)).not.toContain(TOKEN);
  });

  it('phản hồi sai định dạng bị từ chối (validate bằng zod)', async () => {
    server.use(mswHttp.get(`${base}/me/adaccounts`, () => HttpResponse.json({ data: [{ id: 'not-an-account' }] })));
    const { read } = client();
    await expect(read.listAdAccounts(TOKEN)).rejects.toMatchObject({ type: 'ValidationError' });
  });

  it('header usage vượt 75% → giảm đồng thời của app 50%', async () => {
    server.use(
      mswHttp.get(`${base}/me`, () =>
        HttpResponse.json(
          { id: 'u1' },
          { headers: { 'x-business-use-case-usage': JSON.stringify({ '123': [{ call_count: 80, total_time: 10 }] }) } },
        ),
      ),
    );
    const limiter = new MetaLimiter(6);
    const { read } = client({ limiter });
    await read.me(TOKEN);
    expect(limiter.appConcurrency).toBe(3);
  });

  it('insights theo ngày với cửa sổ attribution 7d_click/1d_view', async () => {
    let url: URL | undefined;
    server.use(
      mswHttp.get(`${base}/act_1/insights`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ data: [{ date_start: '2026-10-20', date_stop: '2026-10-20', spend: '125000' }] });
      }),
    );
    const { read } = client();
    const rows = await read.getInsights(TOKEN, 'act_1', { level: 'ad', since: '2026-10-20', until: '2026-10-20' });
    expect(rows[0]!.spend).toBe('125000');
    expect(url!.searchParams.get('time_increment')).toBe('1');
    expect(url!.searchParams.get('action_attribution_windows')).toBe('["7d_click","1d_view"]');
  });

  it('đổi token dài hạn không gửi access_token; client_secret không lộ trong lỗi', async () => {
    let url: URL | undefined;
    server.use(
      mswHttp.get(`${base}/oauth/access_token`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ error: { message: `bad request ${url.search}`, code: 100 } }, { status: 400 });
      }),
    );
    const { http } = client();
    const err = (await exchangeLongLived(http, { appId: 'app', appSecret: 'TOP-SECRET', token: TOKEN }).catch(
      (e: unknown) => e,
    )) as Error;
    expect(url!.searchParams.has('access_token')).toBe(false);
    expect(err.message).not.toContain('TOP-SECRET');
    expect(err.message).not.toContain(TOKEN);
  });
});

describe('MetaLimiter', () => {
  it('mỗi tài khoản chỉ 1 request đồng thời', async () => {
    const limiter = new MetaLimiter(5, 1);
    let active = 0;
    let max = 0;
    const task = () =>
      limiter.run('act_1', async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all([task(), task(), task()]);
    expect(max).toBe(1);
  });

  it('giới hạn toàn app khi nhiều tài khoản chạy song song; giảm tốc có hiệu lực', async () => {
    const limiter = new MetaLimiter(4, 1);
    limiter.throttle(0.5);
    let active = 0;
    let max = 0;
    const task = (acc: string) =>
      limiter.run(acc, async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map(task));
    expect(max).toBe(2);
  });
});

describe('paginate: Meta mã 1 ("giảm lượng dữ liệu") → tự thu nhỏ trang', () => {
  const tooMuch = () =>
    HttpResponse.json(
      { error: { message: 'Please reduce the amount of data you are asking for, then retry your request', code: 1 } },
      { status: 500 },
    );

  it('giảm limit ÷4 cho trang nặng rồi đọc tiếp, không thử lại y nguyên', async () => {
    const limits: number[] = [];
    server.use(
      mswHttp.get(`${base}/act_1/adcreatives`, ({ request }) => {
        const limit = Number(new URL(request.url).searchParams.get('limit'));
        limits.push(limit);
        if (limit > 100) return tooMuch();
        return HttpResponse.json({ data: [{ id: 'c1', name: 'Creative 1' }] });
      }),
    );
    const { read, sleeps } = client();
    const out = await read.listCreatives(TOKEN, 'act_1');
    expect(out.map((c) => c.id)).toEqual(['c1']);
    expect(limits[0]).toBeGreaterThan(100);
    expect(limits.at(-1)).toBeLessThanOrEqual(100);
    expect(limits.every((l, i) => i === 0 || l === Math.max(25, Math.floor(limits[i - 1]! / 4)))).toBe(true);
    expect(sleeps).toEqual([]);
  });

  it('đã ở trang nhỏ nhất vẫn lỗi → thử lại như lỗi tạm thời rồi báo lỗi', async () => {
    server.use(mswHttp.get(`${base}/act_1/adcreatives`, () => tooMuch()));
    const { http, sleeps } = client({ maxAttempts: 2 });
    await expect(
      http.paginate('act_1/adcreatives', TOKEN, { fields: 'id', limit: 25 }, z.object({ id: z.string() })),
    ).rejects.toMatchObject({ code: 1 });
    expect(sleeps).toHaveLength(1);
  });
});
