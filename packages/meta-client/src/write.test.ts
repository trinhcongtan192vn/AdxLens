import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MetaApiError } from './errors';
import { GRAPH_BASE } from './http';
import { MockMetaRead, mockWriteState } from './mock';
import { adSetTargeting, customAudienceRule, HttpMetaWrite } from './write';
import { MockMetaWrite } from './write-mock';

const V = 'v24.0';
const TOKEN = 'EAAGm0PX4ZCpsBAKZCZBZCZCxyzWRITETOKEN0002';
const base = `${GRAPH_BASE}/${V}`;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const write = () => new HttpMetaWrite({ apiVersion: V, appSecret: 'app-secret', sleep: async () => {} });

describe('HttpMetaWrite (ADR-0008..0011)', () => {
  it('đặt trạng thái, ngân sách ngày, nhân bản PAUSED bằng POST form', async () => {
    const bodies: Record<string, string>[] = [];
    server.use(
      mswHttp.post(`${base}/123`, async ({ request }) => {
        bodies.push(Object.fromEntries(new URLSearchParams(await request.text())));
        return HttpResponse.json({ success: true });
      }),
      mswHttp.post(`${base}/456/copies`, async ({ request }) => {
        bodies.push(Object.fromEntries(new URLSearchParams(await request.text())));
        return HttpResponse.json({ copied_adset_id: '789' });
      }),
    );
    const w = write();
    await w.setStatus(TOKEN, '123', 'PAUSED');
    await w.setDailyBudget(TOKEN, '123', '330000');
    expect(await w.copyAdSet(TOKEN, '456')).toEqual({ copiedAdSetId: '789' });
    expect(bodies[0]).toMatchObject({ status: 'PAUSED', access_token: TOKEN });
    expect(bodies[0]!.appsecret_proof).toMatch(/^[0-9a-f]{64}$/);
    expect(bodies[1]).toMatchObject({ daily_budget: '330000' });
    expect(bodies[2]).toMatchObject({ deep_copy: 'true', status_option: 'PAUSED' });
  });

  it('không tự retry ghi khi Meta lỗi tạm thời (tránh nhân đôi tác dụng)', async () => {
    let calls = 0;
    server.use(
      mswHttp.post(`${base}/456/copies`, () => {
        calls++;
        return HttpResponse.json({ error: { message: 'temporarily unavailable', code: 2 } }, { status: 500 });
      }),
    );
    await expect(write().copyAdSet(TOKEN, '456')).rejects.toBeInstanceOf(MetaApiError);
    expect(calls).toBe(1);
  });

  it('ngân sách phải là số nguyên đơn vị nhỏ nhất (không float)', async () => {
    await expect(write().setDailyBudget(TOKEN, '123', '330000.5')).rejects.toThrow();
  });

  it('đọc đối tượng với đúng trường; lỗi không chứa token', async () => {
    server.use(
      mswHttp.get(`${base}/123`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('fields')).toContain('daily_budget');
        return HttpResponse.json({ id: '123', status: 'ACTIVE', daily_budget: 300000 });
      }),
      mswHttp.get(`${base}/999`, () =>
        HttpResponse.json({ error: { message: `bad token ${TOKEN}`, code: 190 } }, { status: 400 }),
      ),
    );
    expect(await write().getObject(TOKEN, '123', 'adset')).toMatchObject({ status: 'ACTIVE', daily_budget: '300000' });
    const err = await write()
      .getObject(TOKEN, '999', 'ad')
      .catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain(TOKEN);
  });
});

describe('MockMetaWrite', () => {
  beforeEach(() => mockWriteState.reset());
  const now = () => new Date('2026-10-23T03:00:00Z');

  it('ghi xong đọc lại thấy thay đổi (ad set, ad, bản sao)', async () => {
    const read = new MockMetaRead(now);
    const w = new MockMetaWrite();
    const [adset] = await read.listAdSets('', 'act_100000001');
    const [ad] = await read.listAds('', 'act_100000001');
    await w.setStatus('', adset!.id, 'PAUSED');
    await w.setDailyBudget('', adset!.id, '123000');
    await w.setStatus('', ad!.id, 'PAUSED');
    const { copiedAdSetId } = await w.copyAdSet('', adset!.id);
    expect(await w.getObject('', adset!.id, 'adset')).toMatchObject({ status: 'PAUSED', daily_budget: '123000' });
    expect((await read.listAds('', 'act_100000001')).find((x) => x.id === ad!.id)!.status).toBe('PAUSED');
    expect(await w.getObject('', copiedAdSetId, 'adset')).toMatchObject({ status: 'PAUSED' });
  });

  it('kịch bản lỗi: trước khi áp (không đổi), sau khi áp (đã đổi nhưng báo lỗi), sai giá trị', async () => {
    const w = new MockMetaWrite();
    const read = new MockMetaRead(now);
    const [a, b, c] = await read.listAds('', 'act_100000001');
    w.failNext('error_before');
    await expect(w.setStatus('', a!.id, 'PAUSED')).rejects.toBeInstanceOf(MetaApiError);
    expect((await w.getObject('', a!.id, 'ad')).status).toBe('ACTIVE');
    w.failNext('error_after');
    await expect(w.setStatus('', b!.id, 'PAUSED')).rejects.toBeInstanceOf(MetaApiError);
    expect((await w.getObject('', b!.id, 'ad')).status).toBe('PAUSED');
    w.failNext('wrong_value');
    await w.setStatus('', c!.id, 'PAUSED');
    expect((await w.getObject('', c!.id, 'ad')).status).toBe('ARCHIVED');
  });

  it('đối tượng không tồn tại → lỗi Meta', async () => {
    const w = new MockMetaWrite();
    await expect(w.getObject('', 'nope', 'ad')).rejects.toBeInstanceOf(MetaApiError);
    await expect(w.setStatus('', 'nope', 'PAUSED')).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe('rule custom audience (ADR-0026)', () => {
  it('pixel theo sự kiện / mọi lượt truy cập; tương tác Page / Instagram; kiểm số ngày và id', () => {
    const r = JSON.parse(customAudienceRule({ type: 'pixel', id: '123', event: 'AddToCart', days: 30 }));
    expect(r.inclusions.rules[0]).toEqual({
      event_sources: [{ id: '123', type: 'pixel' }],
      retention_seconds: 2_592_000,
      filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'AddToCart' }] },
    });
    expect(
      JSON.parse(customAudienceRule({ type: 'pixel', id: '123', event: 'all', days: 7 })).inclusions.rules[0].filter
        .filters[0],
    ).toEqual({ field: 'url', operator: 'i_contains', value: '' });
    expect(
      JSON.parse(customAudienceRule({ type: 'ig_business', id: '9', days: 365 })).inclusions.rules[0].filter.filters[0]
        .value,
    ).toBe('ig_business_profile_all');
    expect(() => customAudienceRule({ type: 'pixel', id: '1', event: 'all', days: 181 })).toThrow();
    expect(() => customAudienceRule({ type: 'page', id: '1', days: 0 })).toThrow();
    expect(() => customAudienceRule({ type: 'page', id: 'x"}', days: 30 })).toThrow();
  });
});

describe('targeting nhóm QC mới (ADR-0026)', () => {
  it('quốc gia, độ tuổi, custom audience; chặn giá trị sai', () => {
    expect(JSON.parse(adSetTargeting({ countries: ['VN'], ageMin: 25, ageMax: 44, audienceIds: ['ca_1'] }))).toEqual({
      geo_locations: { countries: ['VN'] },
      age_min: 25,
      age_max: 44,
      custom_audiences: [{ id: 'ca_1' }],
    });
    expect(
      JSON.parse(adSetTargeting({ countries: ['VN', 'TH'], ageMin: 18, ageMax: 65, audienceIds: [] })),
    ).not.toHaveProperty('custom_audiences');
    expect(() => adSetTargeting({ countries: [], ageMin: 18, ageMax: 65, audienceIds: [] })).toThrow();
    expect(() => adSetTargeting({ countries: ['vn'], ageMin: 18, ageMax: 65, audienceIds: [] })).toThrow();
    expect(() => adSetTargeting({ countries: ['VN'], ageMin: 17, ageMax: 65, audienceIds: [] })).toThrow();
    expect(() => adSetTargeting({ countries: ['VN'], ageMin: 40, ageMax: 30, audienceIds: [] })).toThrow();
  });
});
