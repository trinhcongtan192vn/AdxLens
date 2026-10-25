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
  adset_id: z.string().nullish(),
  campaign_id: z.string().nullish(),
  account_id: z.string().nullish(),
});
export type WritableObject = z.infer<typeof writableObjectSchema>;

export type MetaObjectType = 'ad' | 'adset';

export interface MetaWriteApi {
  /** Đọc trạng thái hiện tại của đối tượng (dùng trước khi ghi và để xác minh sau khi ghi). */
  getObject(token: string, id: string, type: MetaObjectType): Promise<WritableObject>;
  setStatus(token: string, id: string, status: 'ACTIVE' | 'PAUSED'): Promise<void>;
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
  /** Đọc lại audience vừa tạo (xác minh). */
  getAudience(token: string, id: string): Promise<{ id: string; name?: string | null; subtype?: string | null }>;
}

const FIELDS: Record<MetaObjectType, string> = {
  ad: 'id,name,status,effective_status,adset_id,campaign_id,account_id',
  adset: 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,account_id',
};
const okSchema = z.object({ success: z.boolean().optional() }).passthrough();
const copySchema = z.object({ copied_adset_id: z.string() }).passthrough();
const idSchema = z.object({ id: z.string() }).passthrough();
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

  getAudience(token: string, id: string) {
    return this.http.get(id, token, { fields: 'id,name,subtype' }, audienceSchema);
  }
}
