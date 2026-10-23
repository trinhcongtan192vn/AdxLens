import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { MetaApiError, scrubSecrets } from './errors';
import { MetaLimiter } from './limiter';
import { errorEnvelopeSchema, pagingSchema, type MetaCallAudit } from './types';

export const GRAPH_BASE = 'https://graph.facebook.com';

export type MetaHttpOptions = {
  apiVersion: string;
  appSecret?: string;
  fetchImpl?: typeof fetch;
  limiter?: MetaLimiter;
  onAudit?: (a: MetaCallAudit) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Ngưỡng % sử dụng (header x-business-use-case-usage) để tự giảm tốc. */
  throttleAtPct?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wrapper HTTP cho Graph API (L3 6.2). Không bao giờ đưa token vào log, lỗi hay audit. */
export class MetaHttp {
  readonly limiter: MetaLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly throttleAtPct: number;

  constructor(private readonly opts: MetaHttpOptions) {
    this.limiter = opts.limiter ?? new MetaLimiter();
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.throttleAtPct = opts.throttleAtPct ?? 75;
  }

  private url(path: string): URL {
    return new URL(`${GRAPH_BASE}/${this.opts.apiVersion}/${path.replace(/^\//, '')}`);
  }

  private proof(token: string): string | null {
    return this.opts.appSecret ? createHmac('sha256', this.opts.appSecret).update(token).digest('hex') : null;
  }

  /** Đọc header usage: vượt ngưỡng thì giảm đồng thời của app 50%. */
  private observeUsage(res: Response): void {
    const raw = res.headers.get('x-business-use-case-usage') ?? res.headers.get('x-app-usage');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const values: number[] = [];
      const collect = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(collect);
        else if (o && typeof o === 'object') {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === 'number' && /call_count|total_cputime|total_time/.test(k)) values.push(v);
            else collect(v);
          }
        }
      };
      collect(parsed);
      if (values.some((v) => v >= this.throttleAtPct)) this.limiter.throttle(0.5);
    } catch {
      /* header không đúng định dạng: bỏ qua */
    }
  }

  async request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string | URL,
    token: string,
    params: Record<string, string | number | undefined>,
    schema: S,
    meta: { account?: string | null; endpoint?: string; noRetryTooMuchData?: boolean } = {},
  ): Promise<z.infer<S>> {
    const url = typeof path === 'string' ? this.url(path) : new URL(path);
    const body = new URLSearchParams();
    const target = method === 'GET' ? url.searchParams : body;
    for (const [k, v] of Object.entries(params)) if (v !== undefined) target.set(k, String(v));
    // Endpoint OAuth không dùng access_token (token rỗng).
    if (token) {
      target.set('access_token', token);
      const proof = this.proof(token);
      if (proof) target.set('appsecret_proof', proof);
    }
    const endpoint = meta.endpoint ?? url.pathname.replace(/^\/v\d+\.\d+\//, '');

    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      let status = 0;
      let errorCode: number | null = null;
      try {
        const res = await this.limiter.run(meta.account ?? null, () =>
          this.fetchImpl(url, method === 'GET' ? { method } : { method, body }),
        );
        status = res.status;
        this.observeUsage(res);
        const json = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
          const env = errorEnvelopeSchema.safeParse(json);
          const e = env.success ? env.data.error : { message: res.statusText };
          errorCode = 'code' in e && typeof e.code === 'number' ? e.code : null;
          throw new MetaApiError(
            res.status,
            errorCode,
            'error_subcode' in e && typeof e.error_subcode === 'number' ? e.error_subcode : null,
            'type' in e && typeof e.type === 'string' ? e.type : null,
            scrubSecrets(e.message || `HTTP ${res.status}`),
            'fbtrace_id' in e && typeof e.fbtrace_id === 'string' ? e.fbtrace_id : null,
          );
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new MetaApiError(
            res.status,
            null,
            null,
            'ValidationError',
            `Phản hồi Meta sai định dạng ở ${endpoint}`,
            null,
          );
        }
        await this.opts.onAudit?.({
          endpoint,
          account: meta.account ?? null,
          durationMs: Date.now() - started,
          status,
          errorCode,
          attempt,
        });
        return parsed.data;
      } catch (err) {
        const e =
          err instanceof MetaApiError
            ? err
            : new MetaApiError(
                0,
                null,
                null,
                'NetworkError',
                scrubSecrets(err instanceof Error ? err.message : 'network'),
                null,
              );
        await this.opts.onAudit?.({
          endpoint,
          account: meta.account ?? null,
          durationMs: Date.now() - started,
          status,
          errorCode: e.code,
          attempt,
        });
        // Mã 1 trên danh sách thường là "giảm lượng dữ liệu yêu cầu": paginate tự thu nhỏ trang thay vì thử lại y nguyên.
        const retryable =
          (e.isTransient || e.type === 'NetworkError') && !(meta.noRetryTooMuchData && e.code === TOO_MUCH_DATA_CODE);
        if (!retryable || attempt >= this.maxAttempts) throw e;
        // Backoff mũ có jitter; rate limit chờ lâu hơn.
        const base = this.baseDelayMs * 2 ** (attempt - 1) * (e.isRateLimit ? 4 : 1);
        await this.sleep(base + Math.floor(Math.random() * this.baseDelayMs));
      }
    }
  }

  get<S extends z.ZodTypeAny>(
    path: string,
    token: string,
    params: Record<string, string | number | undefined>,
    schema: S,
    meta?: { account?: string | null },
  ) {
    return this.request('GET', path, token, params, schema, meta);
  }

  /** Duyệt hết các trang (`paging.next`), validate từng phần tử. */
  /**
   * Duyệt mọi trang. Meta trả mã 1 khi một trang quá nặng (vd. `adcreatives` 500 dòng có `thumbnail_url`): tự giảm
   * `limit` (÷4, tối thiểu 25) cho trang đó và các trang sau, rồi mới để lỗi đi tiếp.
   */
  async paginate<S extends z.ZodTypeAny>(
    path: string,
    token: string,
    params: Record<string, string | number | undefined>,
    itemSchema: S,
    meta: { account?: string | null; maxPages?: number } = {},
  ): Promise<z.infer<S>[]> {
    const pageSchema = z.object({ data: z.array(itemSchema), paging: pagingSchema });
    const out: z.infer<S>[] = [];
    let next: string | URL = path;
    let nextParams: Record<string, string | number | undefined> = params;
    for (let page = 0; page < (meta.maxPages ?? 500); page++) {
      let res: { data: z.infer<S>[]; paging?: { next?: string } };
      for (;;) {
        const limit = pageLimit(next, nextParams);
        const canShrink = limit !== null && limit > MIN_PAGE_LIMIT;
        try {
          res = (await this.request('GET', next, token, nextParams, pageSchema, {
            account: meta.account,
            endpoint: typeof path === 'string' ? path : undefined,
            noRetryTooMuchData: canShrink,
          })) as typeof res;
          break;
        } catch (e) {
          // Meta mã 1 ("Please reduce the amount of data…") với trang lớn: thử lại cùng trang, `limit` nhỏ hơn.
          if (!(e instanceof MetaApiError) || e.code !== TOO_MUCH_DATA_CODE || !canShrink) throw e;
          const smaller = Math.max(MIN_PAGE_LIMIT, Math.floor(limit / 4));
          if (typeof next === 'string') nextParams = { ...nextParams, limit: smaller };
          else next.searchParams.set('limit', String(smaller));
        }
      }
      out.push(...res.data);
      if (!res.paging?.next) break;
      // Dùng URL "next" của Meta nhưng bỏ access_token trong đó; request() tự gắn lại.
      const u = new URL(res.paging.next);
      u.searchParams.delete('access_token');
      u.searchParams.delete('appsecret_proof');
      next = u;
      nextParams = {};
    }
    return out;
  }
}

/** Mã lỗi chung của Meta, với danh sách thường nghĩa là yêu cầu quá nhiều dữ liệu trong một trang. */
const TOO_MUCH_DATA_CODE = 1;
export const MIN_PAGE_LIMIT = 25;

function pageLimit(next: string | URL, params: Record<string, string | number | undefined>): number | null {
  const raw = typeof next === 'string' ? params.limit : next.searchParams.get('limit');
  const n = raw === undefined || raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}
