import { describe, expect, it } from 'vitest';
import { googleAuthorizeUrl, HttpGoogleAnalytics } from './index';

describe('GA4 (ADR-0029)', () => {
  it('URL OAuth: chỉ quyền đọc analytics, offline + consent (luôn có refresh token)', () => {
    const u = new URL(googleAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: 's',
      response_type: 'code',
    });
  });

  it('đổi code: thiếu refresh token → lỗi; runReport → phiên / chuyển đổi theo ngày', async () => {
    const calls: { url: string; body: string }[] = [];
    const reply: Record<string, unknown> = {
      token: { access_token: 'ya29.x' },
      report: {
        rows: [
          { dimensionValues: [{ value: '20261022' }], metricValues: [{ value: '512' }, { value: '31' }] },
          { dimensionValues: [{ value: '20261021' }], metricValues: [{ value: '480' }, { value: '27' }] },
        ],
      },
    };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body ?? '') });
      return new Response(JSON.stringify(url.includes('runReport') ? reply.report : reply.token), { status: 200 });
    }) as unknown as typeof fetch;
    const api = new HttpGoogleAnalytics({ clientId: 'c', clientSecret: 's', fetchImpl });
    await expect(api.exchangeCode('code', 'https://x/cb')).rejects.toThrow('GA4_NO_REFRESH_TOKEN');
    expect(await api.daily('ya29.x', '123456789', { from: '2026-10-21', to: '2026-10-22' })).toEqual([
      { date: '2026-10-21', sessions: 480, conversions: 27 },
      { date: '2026-10-22', sessions: 512, conversions: 31 },
    ]);
    expect(calls.at(-1)!.url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport');
    await expect(api.daily('ya29.x', '12/../x', { from: '2026-10-21', to: '2026-10-22' })).rejects.toThrow(
      'GA4_BAD_PROPERTY',
    );
  });
});
