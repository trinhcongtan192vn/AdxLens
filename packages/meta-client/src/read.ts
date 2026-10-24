import { z } from 'zod';
import type { MetaHttp } from './http';
import {
  adAccountSchema,
  adSchema,
  adsetSchema,
  businessSchema,
  campaignSchema,
  creativeSchema,
  DEFAULT_ATTRIBUTION,
  insightSchema,
  meSchema,
  pageSchema,
  pixelSchema,
  type MetaAd,
  type MetaAdAccount,
  type MetaAdSet,
  type MetaBusiness,
  type MetaCampaign,
  type MetaCreative,
  type MetaInsight,
  type MetaPage,
  type MetaPixel,
} from './types';

/** Nhóm phân tích theo đối tượng / vị trí / khu vực (roadmap A4). */
export const BREAKDOWNS = {
  age_gender: ['age', 'gender'],
  placement: ['publisher_platform', 'platform_position'],
  region: ['region'],
} as const;
export type BreakdownKey = keyof typeof BREAKDOWNS;

export type InsightQuery = {
  level: 'ad' | 'adset' | 'account';
  since: string;
  until: string;
  attributionWindows?: readonly string[];
  /** Chỉ với level 'adset': tách theo nhóm (Meta `breakdowns`). */
  breakdown?: BreakdownKey;
};

/** API đọc (P0–P1). Phần ghi nằm riêng ở `@adxlens/meta-client/write`, chỉ Execution Gateway dùng. */
export interface MetaReadApi {
  me(token: string): Promise<{ id: string; name?: string }>;
  grantedScopes(token: string): Promise<string[]>;
  listAdAccounts(token: string): Promise<MetaAdAccount[]>;
  listCampaigns(token: string, act: string): Promise<MetaCampaign[]>;
  listAdSets(token: string, act: string): Promise<MetaAdSet[]>;
  listAds(token: string, act: string): Promise<MetaAd[]>;
  listCreatives(token: string, act: string): Promise<MetaCreative[]>;
  getInsights(token: string, act: string, q: InsightQuery): Promise<MetaInsight[]>;
  /** ADR-0016: Page người dùng quản lý (kèm Instagram business account). Không lấy page token. */
  listPages(token: string): Promise<MetaPage[]>;
  listPixels(token: string, act: string): Promise<MetaPixel[]>;
  /** Business + catalog sở hữu. */
  listBusinesses(token: string): Promise<MetaBusiness[]>;
}

export const AD_ACCOUNT_FIELDS = 'id,name,currency,timezone_name,account_status';
const CAMPAIGN_FIELDS = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget';
const ADSET_FIELDS =
  'id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,learning_stage_info,promoted_object';
const AD_FIELDS = 'id,name,adset_id,campaign_id,status,effective_status,creative{id}';
const CREATIVE_FIELDS = 'id,name,thumbnail_url,image_url,object_type,video_id';
const INSIGHT_FIELDS =
  'account_id,campaign_id,adset_id,ad_id,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values';

const permissionsSchema = z.object({
  data: z.array(z.object({ permission: z.string(), status: z.string() })),
});

export class HttpMetaRead implements MetaReadApi {
  constructor(private readonly http: MetaHttp) {}

  me(token: string) {
    return this.http.get('me', token, { fields: 'id,name' }, meSchema);
  }

  async grantedScopes(token: string): Promise<string[]> {
    const r = await this.http.get('me/permissions', token, {}, permissionsSchema);
    return r.data.filter((p) => p.status === 'granted').map((p) => p.permission);
  }

  listAdAccounts(token: string) {
    return this.http.paginate('me/adaccounts', token, { fields: AD_ACCOUNT_FIELDS, limit: 100 }, adAccountSchema);
  }

  listCampaigns(token: string, act: string) {
    return this.http.paginate(`${act}/campaigns`, token, { fields: CAMPAIGN_FIELDS, limit: 500 }, campaignSchema, {
      account: act,
    });
  }

  listAdSets(token: string, act: string) {
    return this.http.paginate(`${act}/adsets`, token, { fields: ADSET_FIELDS, limit: 500 }, adsetSchema, {
      account: act,
    });
  }

  listAds(token: string, act: string) {
    return this.http.paginate(`${act}/ads`, token, { fields: AD_FIELDS, limit: 500 }, adSchema, { account: act });
  }

  listCreatives(token: string, act: string) {
    return this.http.paginate(`${act}/adcreatives`, token, { fields: CREATIVE_FIELDS, limit: 500 }, creativeSchema, {
      account: act,
    });
  }

  listPages(token: string) {
    return this.http.paginate(
      'me/accounts',
      token,
      { fields: 'id,name,category,instagram_business_account{id,username}', limit: 100 },
      pageSchema,
    );
  }

  listPixels(token: string, act: string) {
    return this.http.paginate(
      `${act}/adspixels`,
      token,
      { fields: 'id,name,last_fired_time', limit: 100 },
      pixelSchema,
      {
        account: act,
      },
    );
  }

  listBusinesses(token: string) {
    return this.http.paginate(
      'me/businesses',
      token,
      { fields: 'id,name,owned_product_catalogs{id,name}', limit: 100 },
      businessSchema,
    );
  }

  /** Insights theo ngày (time_increment=1) với cửa sổ attribution khớp Ads Manager (L3 6.3). */
  getInsights(token: string, act: string, q: InsightQuery) {
    return this.http.paginate(
      `${act}/insights`,
      token,
      {
        level: q.level,
        time_increment: 1,
        time_range: JSON.stringify({ since: q.since, until: q.until }),
        fields: INSIGHT_FIELDS,
        action_attribution_windows: JSON.stringify(q.attributionWindows ?? DEFAULT_ATTRIBUTION),
        ...(q.breakdown ? { breakdowns: BREAKDOWNS[q.breakdown].join(',') } : {}),
        limit: 500,
      },
      insightSchema,
      { account: act },
    );
  }
}
