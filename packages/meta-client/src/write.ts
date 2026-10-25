/**
 * Phần GHI của Meta Marketing API (P2, ADR-0008..0011). CHỈ `packages/core/execution` được import file này
 * (CLAUDE.md quy tắc 3, kiểm bằng `check-boundaries`). Không tự retry: gọi ghi lặp có thể nhân đôi tác
 * dụng (nhân bản ad set) — Execution Gateway đọc lại trạng thái để quyết định.
 */
import { z } from 'zod';
import { MetaHttp, type MetaHttpOptions } from './http';

const numStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const writableObjectSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  effective_status: z.string().nullish(),
  daily_budget: numStr.nullish(),
  lifetime_budget: numStr.nullish(),
  bid_amount: numStr.nullish(),
  spend_cap: numStr.nullish(),
  adset_id: z.string().nullish(),
  campaign_id: z.string().nullish(),
  account_id: z.string().nullish(),
});
export type WritableObject = z.infer<typeof writableObjectSchema>;

export type MetaObjectType = 'ad' | 'adset' | 'campaign';

/** ADR-0026: nguồn của custom audience — pixel (sự kiện website), tương tác Page, tương tác Instagram doanh nghiệp. */
export type CustomAudienceSource =
  | { type: 'pixel'; id: string; event: 'all' | (typeof PIXEL_EVENTS)[number]; days: number }
  | { type: 'page' | 'ig_business'; id: string; days: number };
export const PIXEL_EVENTS = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead'] as const;

/** ADR-0027: nút CTA cho creative mới (danh sách cố định). */
export const CREATIVE_CTAS = [
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'CONTACT_US',
  'ORDER_NOW',
  'GET_OFFER',
  'BOOK_TRAVEL',
  'SUBSCRIBE',
  'APPLY_NOW',
  'DOWNLOAD',
  'MESSAGE_PAGE',
] as const;
export type CreativeCta = (typeof CREATIVE_CTAS)[number];
export type NewCreative = {
  name: string;
  pageId: string;
  imageHash: string;
  link: string;
  message: string;
  headline: string;
  cta: CreativeCta;
};

/** `object_story_spec` (JSON) cho creative ảnh đơn với link. */
export function creativeStorySpec(c: NewCreative): string {
  return JSON.stringify({
    page_id: c.pageId,
    link_data: {
      image_hash: c.imageHash,
      link: c.link,
      message: c.message,
      name: c.headline,
      call_to_action: { type: c.cta, value: { link: c.link } },
    },
  });
}

/** ADR-0026: nhắm mục tiêu của nhóm QC mới (tối giản): quốc gia, độ tuổi, custom audience đưa vào. */
export type NewAdSetTargeting = { countries: string[]; ageMin: number; ageMax: number; audienceIds: string[] };

/** `targeting` (JSON) của Meta cho nhóm QC mới. */
export function adSetTargeting(t: NewAdSetTargeting): string {
  if (!t.countries.length || t.countries.length > 25 || t.countries.some((c) => !/^[A-Z]{2}$/.test(c))) {
    throw new Error('Quốc gia không hợp lệ');
  }
  if (
    !Number.isInteger(t.ageMin) ||
    !Number.isInteger(t.ageMax) ||
    t.ageMin < 18 ||
    t.ageMax > 65 ||
    t.ageMin > t.ageMax
  ) {
    throw new Error('Độ tuổi 18–65');
  }
  if (t.audienceIds.length > 10 || t.audienceIds.some((a) => !/^[\w-]{1,40}$/.test(a)))
    throw new Error('Audience không hợp lệ');
  return JSON.stringify({
    geo_locations: { countries: t.countries },
    age_min: t.ageMin,
    age_max: t.ageMax,
    ...(t.audienceIds.length ? { custom_audiences: t.audienceIds.map((id) => ({ id })) } : {}),
  });
}

/** `rule` (JSON) của Meta cho custom audience website / tương tác. Kiểm khoảng ngày theo giới hạn của Meta. */
export function customAudienceRule(s: CustomAudienceSource): string {
  const max = s.type === 'pixel' ? 180 : 365;
  if (!Number.isInteger(s.days) || s.days < 1 || s.days > max) throw new Error(`Số ngày 1–${max}`);
  if (!/^[\w-]{1,40}$/.test(s.id)) throw new Error('id nguồn không hợp lệ');
  const filter =
    s.type === 'pixel'
      ? s.event === 'all'
        ? { field: 'url', operator: 'i_contains', value: '' }
        : { field: 'event', operator: 'eq', value: s.event }
      : { field: 'event', operator: 'eq', value: s.type === 'page' ? 'page_engaged' : 'ig_business_profile_all' };
  return JSON.stringify({
    inclusions: {
      operator: 'or',
      rules: [
        {
          event_sources: [{ id: s.id, type: s.type }],
          retention_seconds: s.days * 86_400,
          filter: { operator: 'and', filters: [filter] },
        },
      ],
    },
  });
}

export interface MetaWriteApi {
  /** Đọc trạng thái hiện tại của đối tượng (dùng trước khi ghi và để xác minh sau khi ghi). */
  getObject(token: string, id: string, type: MetaObjectType): Promise<WritableObject>;
  setStatus(token: string, id: string, status: 'ACTIVE' | 'PAUSED'): Promise<void>;
  /** ADR-0025: đổi tên ad / ad set / chiến dịch. */
  setName(token: string, id: string, name: string): Promise<void>;
  /** ADR-0025: giá thầu nhóm QC (Bid cap / Cost cap), số nguyên đơn vị nhỏ nhất. */
  setBidAmount(token: string, adsetId: string, amount: string): Promise<void>;
  /** ADR-0025: giới hạn chi tiêu chiến dịch, số nguyên đơn vị nhỏ nhất. */
  setSpendCap(token: string, campaignId: string, amount: string): Promise<void>;
  /** `amount` là số nguyên đơn vị nhỏ nhất của tiền tệ, dạng chuỗi (không float). */
  setDailyBudget(token: string, adsetId: string, amount: string): Promise<void>;
  /** Nhân bản sâu ad set, bản sao luôn PAUSED (ADR-0011). */
  copyAdSet(token: string, adsetId: string): Promise<{ copiedAdSetId: string }>;
  /** ADR-0023: tạo quảng cáo từ creative có sẵn, luôn PAUSED. `act` dạng `act_<id>`. */
  createAd(
    token: string,
    act: string,
    input: { name: string; adsetId: string; creativeId: string },
  ): Promise<{ id: string }>;
  /** ADR-0023: tạo lookalike từ custom audience có sẵn; `ratio` 0.01–0.10, `country` mã ISO 2 chữ. */
  createLookalike(
    token: string,
    act: string,
    input: { name: string; originAudienceId: string; country: string; ratio: string },
  ): Promise<{ id: string }>;
  /** ADR-0026: tạo custom audience từ pixel / tương tác Page / Instagram. */
  createCustomAudience(
    token: string,
    act: string,
    input: { name: string; source: CustomAudienceSource },
  ): Promise<{ id: string }>;
  /**
   * ADR-0026: tạo nhóm QC mới trong chiến dịch, luôn PAUSED. Thiết lập tối ưu / giá thầu chép từ nhóm QC mẫu (đọc
   * ngay trước khi tạo); `dailyBudget` bỏ trống khi chiến dịch dùng ngân sách chiến dịch.
   */
  createAdSet(
    token: string,
    act: string,
    input: { name: string; templateAdSetId: string; dailyBudget: string | null; targeting: NewAdSetTargeting },
  ): Promise<{ id: string }>;
  /** ADR-0027: tải ảnh lên thư viện ảnh của tài khoản QC; trả `hash` (dùng trong creative) và URL. */
  uploadAdImage(token: string, act: string, bytes: Uint8Array): Promise<{ hash: string; url: string | null }>;
  /** ADR-0027: tạo ad creative ảnh đơn (không tự chạy; quảng cáo tạo qua Ad Launcher, luôn PAUSED). */
  createAdCreative(token: string, act: string, input: NewCreative): Promise<{ id: string }>;
  /** Đọc lại creative vừa tạo (xác minh). */
  getCreative(token: string, id: string): Promise<{ id: string; name?: string | null; image_hash?: string | null }>;
  /** Đọc lại audience vừa tạo (xác minh). */
  getAudience(token: string, id: string): Promise<{ id: string; name?: string | null; subtype?: string | null }>;
}

const FIELDS: Record<MetaObjectType, string> = {
  ad: 'id,name,status,effective_status,adset_id,campaign_id,account_id',
  adset: 'id,name,status,effective_status,daily_budget,lifetime_budget,bid_amount,campaign_id,account_id',
  campaign: 'id,name,status,effective_status,daily_budget,lifetime_budget,spend_cap,account_id',
};
const okSchema = z.object({ success: z.boolean().optional() }).passthrough();
const copySchema = z.object({ copied_adset_id: z.string() }).passthrough();
const idSchema = z.object({ id: z.string() }).passthrough();
const adImagesSchema = z.object({
  images: z.record(z.string(), z.object({ hash: z.string(), url: z.string().nullish() }).passthrough()),
});
const creativeReadSchema = z.object({ id: z.string(), name: z.string().nullish(), image_hash: z.string().nullish() });
const templateSchema = z
  .object({
    campaign_id: z.string(),
    optimization_goal: z.string().nullish(),
    billing_event: z.string().nullish(),
    bid_strategy: z.string().nullish(),
    bid_amount: numStr.nullish(),
    destination_type: z.string().nullish(),
    promoted_object: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();
const audienceSchema = z.object({ id: z.string(), name: z.string().nullish(), subtype: z.string().nullish() });

export class HttpMetaWrite implements MetaWriteApi {
  private readonly http: MetaHttp;

  /** Luôn `maxAttempts = 1` cho ghi; đọc dùng cùng client (đọc lại do gateway chủ động). */
  constructor(opts: MetaHttpOptions) {
    this.http = new MetaHttp({ ...opts, maxAttempts: 1 });
  }

  getObject(token: string, id: string, type: MetaObjectType) {
    return this.http.get(id, token, { fields: FIELDS[type] }, writableObjectSchema);
  }

  async setStatus(token: string, id: string, status: 'ACTIVE' | 'PAUSED') {
    await this.http.request('POST', id, token, { status }, okSchema, { endpoint: 'object/status' });
  }

  async setName(token: string, id: string, name: string) {
    await this.http.request('POST', id, token, { name }, okSchema, { endpoint: 'object/name' });
  }

  async setBidAmount(token: string, adsetId: string, amount: string) {
    if (!/^\d+$/.test(amount)) throw new Error('bid_amount phải là số nguyên đơn vị nhỏ nhất');
    await this.http.request('POST', adsetId, token, { bid_amount: amount }, okSchema, { endpoint: 'adset/bid' });
  }

  async setSpendCap(token: string, campaignId: string, amount: string) {
    if (!/^\d+$/.test(amount)) throw new Error('spend_cap phải là số nguyên đơn vị nhỏ nhất');
    await this.http.request('POST', campaignId, token, { spend_cap: amount }, okSchema, {
      endpoint: 'campaign/spend_cap',
    });
  }

  async setDailyBudget(token: string, adsetId: string, amount: string) {
    if (!/^\d+$/.test(amount)) throw new Error('daily_budget phải là số nguyên đơn vị nhỏ nhất');
    await this.http.request('POST', adsetId, token, { daily_budget: amount }, okSchema, { endpoint: 'adset/budget' });
  }

  async copyAdSet(token: string, adsetId: string) {
    const r = await this.http.request(
      'POST',
      `${adsetId}/copies`,
      token,
      { deep_copy: 'true', status_option: 'PAUSED' },
      copySchema,
      { endpoint: 'adset/copies' },
    );
    return { copiedAdSetId: r.copied_adset_id };
  }

  async createAd(token: string, act: string, input: { name: string; adsetId: string; creativeId: string }) {
    const r = await this.http.request(
      'POST',
      `${act}/ads`,
      token,
      {
        name: input.name,
        adset_id: input.adsetId,
        creative: JSON.stringify({ creative_id: input.creativeId }),
        status: 'PAUSED',
      },
      idSchema,
      { endpoint: 'ads/create' },
    );
    return { id: r.id };
  }

  async createLookalike(
    token: string,
    act: string,
    input: { name: string; originAudienceId: string; country: string; ratio: string },
  ) {
    const r = await this.http.request(
      'POST',
      `${act}/customaudiences`,
      token,
      {
        name: input.name,
        subtype: 'LOOKALIKE',
        origin_audience_id: input.originAudienceId,
        lookalike_spec: JSON.stringify({ ratio: Number(input.ratio), country: input.country }),
      },
      idSchema,
      { endpoint: 'customaudiences/create' },
    );
    return { id: r.id };
  }

  async createCustomAudience(token: string, act: string, input: { name: string; source: CustomAudienceSource }) {
    const r = await this.http.request(
      'POST',
      `${act}/customaudiences`,
      token,
      { name: input.name, rule: customAudienceRule(input.source), prefill: '1' },
      idSchema,
      { endpoint: 'customaudiences/create' },
    );
    return { id: r.id };
  }

  async createAdSet(
    token: string,
    act: string,
    input: { name: string; templateAdSetId: string; dailyBudget: string | null; targeting: NewAdSetTargeting },
  ) {
    if (input.dailyBudget !== null && !/^\d+$/.test(input.dailyBudget)) {
      throw new Error('daily_budget phải là số nguyên đơn vị nhỏ nhất');
    }
    const tpl = await this.http.get(
      input.templateAdSetId,
      token,
      {
        fields: 'campaign_id,optimization_goal,billing_event,bid_strategy,bid_amount,promoted_object,destination_type',
      },
      templateSchema,
    );
    const r = await this.http.request(
      'POST',
      `${act}/adsets`,
      token,
      {
        name: input.name,
        campaign_id: tpl.campaign_id,
        status: 'PAUSED',
        targeting: adSetTargeting(input.targeting),
        ...(input.dailyBudget ? { daily_budget: input.dailyBudget } : {}),
        ...(tpl.optimization_goal ? { optimization_goal: tpl.optimization_goal } : {}),
        ...(tpl.billing_event ? { billing_event: tpl.billing_event } : {}),
        ...(tpl.bid_strategy ? { bid_strategy: tpl.bid_strategy } : {}),
        ...(tpl.bid_amount ? { bid_amount: tpl.bid_amount } : {}),
        ...(tpl.destination_type ? { destination_type: tpl.destination_type } : {}),
        ...(tpl.promoted_object ? { promoted_object: JSON.stringify(tpl.promoted_object) } : {}),
      },
      idSchema,
      { endpoint: 'adsets/create' },
    );
    return { id: r.id };
  }

  async uploadAdImage(token: string, act: string, bytes: Uint8Array) {
    const r = await this.http.request(
      'POST',
      `${act}/adimages`,
      token,
      { bytes: Buffer.from(bytes).toString('base64') },
      adImagesSchema,
      { endpoint: 'adimages/create' },
    );
    const first = Object.values(r.images)[0];
    if (!first?.hash) throw new Error('Meta không trả hash ảnh');
    return { hash: first.hash, url: first.url ?? null };
  }

  async createAdCreative(token: string, act: string, input: NewCreative) {
    const r = await this.http.request(
      'POST',
      `${act}/adcreatives`,
      token,
      { name: input.name, object_story_spec: creativeStorySpec(input) },
      idSchema,
      { endpoint: 'adcreatives/create' },
    );
    return { id: r.id };
  }

  getCreative(token: string, id: string) {
    return this.http.get(id, token, { fields: 'id,name,image_hash' }, creativeReadSchema);
  }

  getAudience(token: string, id: string) {
    return this.http.get(id, token, { fields: 'id,name,subtype' }, audienceSchema);
  }
}
