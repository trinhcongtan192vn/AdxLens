/**
 * Meta giả (META_MOCK=1, chỉ local/test): dữ liệu xác định theo id + ngày để chạy toàn luồng không
 * cần app Meta. Cài sẵn mẫu cho rule audit (B2) và một ngày lệch 1,4% để thử đối chiếu (B1).
 * KHÔNG dùng ở staging/production.
 */
import type { InsightQuery, MetaReadApi } from './read';
import type { MetaAd, MetaAdAccount, MetaAdSet, MetaCampaign, MetaCreative, MetaInsight, MetaPage } from './types';
import { CONNECT_SCOPES, WRITE_SCOPES } from './oauth';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Số giả ngẫu nhiên [0,1) xác định theo khóa. */
function rand(key: string): number {
  let t = hash(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const MOCK_ACCOUNTS: MetaAdAccount[] = [
  {
    id: 'act_100000001',
    name: 'Cà phê Nhà Rang',
    currency: 'VND',
    timezone_name: 'Asia/Ho_Chi_Minh',
    account_status: 1,
  },
  {
    id: 'act_100000002',
    name: 'Thời trang Linh',
    currency: 'VND',
    timezone_name: 'Asia/Ho_Chi_Minh',
    account_status: 1,
  },
  {
    id: 'act_100000003',
    name: 'Nội thất An Cư',
    currency: 'VND',
    timezone_name: 'Asia/Ho_Chi_Minh',
    account_status: 1,
  },
  { id: 'act_100000004', name: 'Tour Đà Lạt Xanh', currency: 'USD', timezone_name: 'Asia/Bangkok', account_status: 1 },
];

/** Tài khoản/ngày bị cài lệch spend 1,4% ở mức account (số ngày trước "hôm nay" theo múi giờ tài khoản). */
export const MOCK_DISCREPANCY = { account: 'act_100000002', daysAgo: 3, factor: 1.014 } as const;

const OBJECTIVES = ['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC'] as const;
const GOAL: Record<(typeof OBJECTIVES)[number], { goal: string; action: string }> = {
  OUTCOME_SALES: { goal: 'OFFSITE_CONVERSIONS', action: 'offsite_conversion.fb_pixel_purchase' },
  OUTCOME_LEADS: { goal: 'LEAD_GENERATION', action: 'lead' },
  OUTCOME_TRAFFIC: { goal: 'LINK_CLICKS', action: 'link_click' },
};

type Structure = { campaigns: MetaCampaign[]; adsets: MetaAdSet[]; ads: MetaAd[]; creatives: MetaCreative[] };

function accountNum(act: string): string {
  return act.replace('act_', '').slice(-2);
}

/**
 * Trạng thái ghi của Meta giả (chỉ trong tiến trình): `MockMetaWrite` ghi vào đây, `MockMetaRead` áp lên
 * cấu trúc xác định khi đọc — để luồng ghi → đọc lại (verifier) chạy được ở local/test.
 */
export const mockWriteState = {
  overrides: new Map<string, { status?: string; daily_budget?: string }>(),
  copies: new Map<string, MetaAdSet>(),
  /** ADR-0023: quảng cáo / audience tạo qua Meta giả. */
  createdAds: new Map<string, MetaAd & { act: string }>(),
  createdAudiences: new Map<string, { id: string; name: string; subtype: string; act: string }>(),
  reset(): void {
    this.overrides.clear();
    this.copies.clear();
    this.createdAds.clear();
    this.createdAudiences.clear();
  },
};

function applyOverride<T extends { id: string; status?: string | null; effective_status?: string | null }>(o: T): T {
  const w = mockWriteState.overrides.get(o.id);
  if (!w) return o;
  return {
    ...o,
    ...(w.status ? { status: w.status, effective_status: w.status } : {}),
    ...(w.daily_budget !== undefined ? { daily_budget: w.daily_budget } : {}),
  };
}

/** Cấu trúc tài khoản giả sau khi áp các thay đổi đã ghi (dùng chung cho đọc và ghi giả). */
export function mockStructure(act: string): Structure {
  const s = structure(act);
  const copies = [...mockWriteState.copies.values()].filter((c) => s.campaigns.some((x) => x.id === c.campaign_id));
  const created = [...mockWriteState.createdAds.values()].filter((a) => a.act === act).map(({ act: _a, ...ad }) => ad);
  return {
    ...s,
    campaigns: s.campaigns.map(applyOverride),
    adsets: [...s.adsets, ...copies].map(applyOverride),
    ads: [...s.ads, ...created].map(applyOverride),
  };
}

function structure(act: string): Structure {
  const n = accountNum(act);
  const campaigns: MetaCampaign[] = [];
  const adsets: MetaAdSet[] = [];
  const ads: MetaAd[] = [];
  const creatives: MetaCreative[] = [];
  OBJECTIVES.forEach((objective, ci) => {
    const cid = `23${n}${ci}000`;
    // Chiến dịch traffic phân mảnh: nhiều ad set ngân sách nhỏ.
    const adsetCount = objective === 'OUTCOME_TRAFFIC' ? 6 : 3;
    campaigns.push({
      id: cid,
      name: ['Bán hàng', 'Thu lead', 'Traffic'][ci] + ` · ${act.slice(-4)}`,
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
      objective,
      daily_budget: null,
      lifetime_budget: null,
    });
    for (let si = 0; si < adsetCount; si++) {
      const sid = `${cid}${si}0`;
      const small = objective === 'OUTCOME_TRAFFIC';
      adsets.push({
        id: sid,
        name: `${['LAL 1%', 'Retarget 30d', 'Sở thích', 'Rộng', 'Nam 25-34', 'Nữ 25-34'][si]}`,
        campaign_id: cid,
        status: 'ACTIVE',
        effective_status: 'ACTIVE',
        optimization_goal: GOAL[objective].goal,
        daily_budget: small ? '50000' : String(300000 + si * 150000),
        lifetime_budget: null,
        learning_stage_info: { status: small || (ci === 1 && si === 2) ? 'LEARNING_LIMITED' : 'SUCCESS' },
        promoted_object: objective === 'OUTCOME_SALES' ? { custom_event_type: 'PURCHASE' } : null,
        // Giai đoạn phễu: LAL (prospecting), retarget web 30 ngày; ad set thứ 3 của chiến dịch lead nhắm khách cũ.
        targeting: {
          custom_audiences:
            si === 0
              ? [{ id: `ca_lal_${n}`, name: 'Lookalike 1% khách mua' }]
              : si === 1
                ? [{ id: `ca_web_${n}`, name: 'Web 30 ngày' }]
                : ci === 1 && si === 2
                  ? [{ id: `ca_list_${n}`, name: 'Khách cũ (danh sách)' }]
                  : [],
          // Ad set "Sở thích": 2 interest (Top Audiences).
          ...(si === 2 && ci !== 1
            ? {
                flexible_spec: [
                  {
                    interests: [
                      { id: '6003139266461', name: 'Mỹ phẩm' },
                      { id: '6003397425735', name: 'Thời trang' },
                    ],
                  },
                ],
              }
            : {}),
        },
      });
      const adCount = small ? 1 : 3;
      for (let ai = 0; ai < adCount; ai++) {
        const aid = `${sid}${ai}`;
        const crid = `9${aid}`;
        creatives.push({
          id: crid,
          name: `Creative ${aid.slice(-4)}`,
          thumbnail_url: `https://picsum.photos/seed/${crid}/128/128`,
          image_url: null,
          object_type: ai === 0 ? 'VIDEO' : 'PHOTO',
          video_id: ai === 0 ? `7${aid}` : null,
          body: [
            '🔥 Sale 50% hôm nay! Mua ngay kẻo lỡ 👉',
            'Bộ sưu tập mới cho mùa lễ hội. Chất liệu cao cấp, giao hàng toàn quốc trong 48 giờ, đổi trả miễn phí 30 ngày. Xem thêm tại website chính thức của chúng tôi.',
            'Ưu đãi riêng cho bạn',
          ][ai],
          title: ['Giảm 50%', 'Bộ sưu tập mới', 'Ưu đãi'][ai],
          link_url: `https://shop.example.vn/${['sale', 'bo-suu-tap', 'uu-dai'][ai]}?utm_source=fb&utm_campaign=${cid}`,
          call_to_action_type: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP'][ai],
        });
        ads.push({
          id: aid,
          name: `${['Video A', 'Ảnh B', 'Carousel C'][ai]} - ${['Tết', 'Sale 10.10', 'Thường'][si % 3]}`,
          adset_id: sid,
          campaign_id: cid,
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          creative: { id: crid },
        });
      }
    }
  });
  return { campaigns, adsets, ads, creatives };
}

function addDays(iso: string, d: number): string {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  );
}

function round(n: number, currency: string): string {
  return currency === 'USD' ? n.toFixed(2) : String(Math.round(n));
}

/** Insight của một ad trong một ngày, có các mẫu cài sẵn cho rule audit. */
function adDay(
  act: string,
  ad: MetaAd,
  adset: MetaAdSet,
  campaign: MetaCampaign,
  date: string,
  today: string,
): MetaInsight {
  const acc = MOCK_ACCOUNTS.find((a) => a.id === act)!;
  const usd = acc.currency === 'USD';
  const scale = usd ? 1 / 25000 : 1;
  const r = (k: string) => rand(`${ad.id}:${date}:${k}`);
  const daysAgo = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  const objective = campaign.objective as (typeof OBJECTIVES)[number];
  const idx = Number(ad.id.slice(-1));
  const sIdx = Number(adset.id.slice(-2, -1));

  let spend = (180000 + r('s') * 220000) * (adset.daily_budget === '50000' ? 0.22 : 1);
  let freq = 1.2 + r('f') * 0.6;
  let ctr = 0.012 + r('c') * 0.01;
  let cvr = objective === 'OUTCOME_SALES' ? 0.025 : objective === 'OUTCOME_LEADS' ? 0.08 : 1;

  // Mẫu 1 — creative fatigue: ad đầu của chiến dịch bán hàng, ad set đầu, 7 ngày gần: tần suất tăng, CTR giảm.
  if (objective === 'OUTCOME_SALES' && sIdx === 0 && idx === 0 && daysAgo <= 7) {
    freq = 2.9 + (7 - daysAgo) * 0.12;
    ctr *= 0.45;
  }
  // Mẫu 2 — chi tiêu không chuyển đổi: ad set "Sở thích" của chiến dịch thu lead.
  if (objective === 'OUTCOME_LEADS' && sIdx === 2) cvr = 0;
  // Mẫu 3 — ad thắng bị bỏ đói: ad cuối ad set Retarget của chiến dịch bán hàng, chi tiêu thấp, chuyển đổi cao.
  if (objective === 'OUTCOME_SALES' && sIdx === 1 && idx === 2) {
    spend *= 0.18;
    cvr = 0.09;
  }

  const impressions = Math.round((spend / (35000 + r('cpm') * 25000)) * 1000);
  const reach = Math.max(1, Math.round(impressions / freq));
  const clicks = Math.round(impressions * ctr * 1.3);
  const linkClicks = Math.round(impressions * ctr);
  const actions: MetaInsight['actions'] = [{ action_type: 'link_click', value: String(linkClicks) }];
  const valueActions: MetaInsight['action_values'] = [];
  if (objective !== 'OUTCOME_TRAFFIC') {
    const conv = Math.round(linkClicks * cvr);
    actions.push({ action_type: GOAL[objective].action, value: String(conv) });
    if (objective === 'OUTCOME_SALES') {
      // ADR-0017: thêm giỏ (chỉ số phụ kiểu Madgicx "Cost per add to cart").
      actions.push({ action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: String(conv * 4) });
      valueActions.push({
        action_type: GOAL[objective].action,
        value: round(conv * (420000 + r('aov') * 200000) * scale, acc.currency),
      });
    }
  }
  return {
    date_start: date,
    date_stop: date,
    account_id: act.replace('act_', ''),
    campaign_id: campaign.id,
    adset_id: adset.id,
    ad_id: ad.id,
    spend: round(spend * scale, acc.currency),
    impressions: String(impressions),
    reach: String(reach),
    frequency: (impressions / reach).toFixed(6),
    clicks: String(clicks),
    inline_link_clicks: String(linkClicks),
    actions,
    action_values: valueActions,
  };
}

function sumActions(rows: MetaInsight[], key: 'actions' | 'action_values', currency: string) {
  const m = new Map<string, number>();
  for (const r of rows)
    for (const a of r[key] ?? []) m.set(a.action_type, (m.get(a.action_type) ?? 0) + Number(a.value));
  return [...m].map(([action_type, v]) => ({
    action_type,
    value: key === 'action_values' ? round(v, currency) : String(v),
  }));
}

/** Nhóm giả cho breakdowns (A4): khóa trường Meta + trọng số cố định (tổng 1). */
const MOCK_BREAKDOWNS: Record<
  NonNullable<InsightQuery['breakdown']>,
  { fields: Partial<MetaInsight>; weight: number }[]
> = {
  age_gender: [
    { fields: { age: '18-24', gender: 'female' }, weight: 0.12 },
    { fields: { age: '18-24', gender: 'male' }, weight: 0.08 },
    { fields: { age: '25-34', gender: 'female' }, weight: 0.27 },
    { fields: { age: '25-34', gender: 'male' }, weight: 0.18 },
    { fields: { age: '35-44', gender: 'female' }, weight: 0.17 },
    { fields: { age: '35-44', gender: 'male' }, weight: 0.1 },
    { fields: { age: '45-54', gender: 'female' }, weight: 0.05 },
    { fields: { age: '45-54', gender: 'male' }, weight: 0.03 },
  ],
  placement: [
    { fields: { publisher_platform: 'facebook', platform_position: 'feed' }, weight: 0.42 },
    { fields: { publisher_platform: 'instagram', platform_position: 'feed' }, weight: 0.26 },
    { fields: { publisher_platform: 'instagram', platform_position: 'story' }, weight: 0.2 },
    { fields: { publisher_platform: 'facebook', platform_position: 'marketplace' }, weight: 0.12 },
  ],
  region: [
    { fields: { region: 'Ho Chi Minh City' }, weight: 0.46 },
    { fields: { region: 'Hanoi' }, weight: 0.31 },
    { fields: { region: 'Da Nang' }, weight: 0.11 },
    { fields: { region: 'Can Tho' }, weight: 0.07 },
    { fields: { region: 'Hai Phong' }, weight: 0.05 },
  ],
  country: [
    { fields: { country: 'VN' }, weight: 0.86 },
    { fields: { country: 'US' }, weight: 0.05 },
    { fields: { country: 'SG' }, weight: 0.04 },
    { fields: { country: 'TH' }, weight: 0.03 },
    { fields: { country: 'KH' }, weight: 0.02 },
  ],
};

/** Tách một dòng thành các nhóm theo trọng số; nhóm cuối nhận phần dư để tổng khớp đúng dòng gốc. */
function splitRow(row: MetaInsight, groups: { fields: Partial<MetaInsight>; weight: number }[], currency: string) {
  const ints = ['impressions', 'reach', 'clicks', 'inline_link_clicks'] as const;
  const left: Record<string, number> = Object.fromEntries(ints.map((k) => [k, Number(row[k] ?? 0)]));
  let spendLeft = Number(row.spend);
  const actLeft = new Map((row.actions ?? []).map((a) => [a.action_type, Number(a.value)]));
  const valLeft = new Map((row.action_values ?? []).map((a) => [a.action_type, Number(a.value)]));
  return groups.map((g, i) => {
    const last = i === groups.length - 1;
    const take = (total: number, remaining: number, roundFn: (v: number) => number) =>
      last ? remaining : roundFn(total * g.weight);
    const out: MetaInsight = { ...row, ...g.fields };
    for (const k of ints) {
      const v = take(Number(row[k] ?? 0), left[k]!, Math.floor);
      left[k]! -= v;
      out[k] = String(v);
    }
    const sp = take(Number(row.spend), spendLeft, (v) => Number(round(v, currency)));
    spendLeft -= sp;
    out.spend = round(sp, currency);
    out.actions = (row.actions ?? []).map((a) => {
      const v = take(Number(a.value), actLeft.get(a.action_type)!, Math.floor);
      actLeft.set(a.action_type, actLeft.get(a.action_type)! - v);
      return { action_type: a.action_type, value: String(v) };
    });
    out.action_values = (row.action_values ?? []).map((a) => {
      const v = take(Number(a.value), valLeft.get(a.action_type)!, (x) => Number(round(x, currency)));
      valLeft.set(a.action_type, valLeft.get(a.action_type)! - v);
      return { action_type: a.action_type, value: round(v, currency) };
    });
    return out;
  });
}

export const MOCK_PAGES: MetaPage[] = [
  {
    id: 'page1',
    name: 'Trang Mock A',
    category: 'Shopping & retail',
    instagram_business_account: { id: 'ig1', username: 'mock_a' },
  },
  { id: 'page2', name: 'Trang Mock B', category: 'Hotel', instagram_business_account: null },
];

export class MockMetaRead implements MetaReadApi {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async me() {
    return { id: 'mock-meta-user', name: 'Meta Mock User' };
  }

  /** Token `mock-write-*` (P201) → quyền ghi; còn lại → bộ quyền kết nối ADR-0016 (Meta cấp đủ). */
  async grantedScopes(token: string) {
    return token.includes('write') ? [...WRITE_SCOPES] : [...CONNECT_SCOPES];
  }

  async listPages() {
    return MOCK_PAGES;
  }

  async listPixels(_t: string, act: string) {
    return [
      { id: `pix${accountNum(act)}`, name: `Pixel ${accountNum(act)}`, last_fired_time: '2026-10-23T10:00:00+0000' },
    ];
  }

  /** Gợi ý interest giả, xác định theo tên đầu vào (không gợi ý lại chính các tên đó). */
  async suggestInterests(_t: string, names: string[]) {
    const pool = [
      { id: '6003020834693', name: 'Chăm sóc da', path: ['Sở thích', 'Làm đẹp'], size: 4_200_000 },
      { id: '6003456388203', name: 'Trang điểm', path: ['Sở thích', 'Làm đẹp'], size: 3_100_000 },
      { id: '6003348604581', name: 'Mua sắm trực tuyến', path: ['Hành vi mua sắm'], size: 9_800_000 },
      { id: '6003107902433', name: 'Thời trang nữ', path: ['Sở thích', 'Thời trang'], size: 5_600_000 },
      { id: '6003139266461', name: 'Mỹ phẩm', path: ['Sở thích', 'Làm đẹp'], size: 6_000_000 },
    ];
    return names.length
      ? pool
          .filter((p) => !names.includes(p.name))
          .map((p) => ({
            id: p.id,
            name: p.name,
            audience_size_lower_bound: Math.round(p.size * 0.9),
            audience_size_upper_bound: Math.round(p.size * 1.1),
            path: p.path,
            topic: p.path[p.path.length - 1] ?? null,
          }))
      : [];
  }

  async listCustomAudiences(_t: string, act: string) {
    const n = accountNum(act);
    return [
      { id: `ca_lal_${n}`, name: 'Lookalike 1% khách mua', subtype: 'LOOKALIKE' },
      { id: `ca_web_${n}`, name: 'Web 30 ngày', subtype: 'WEBSITE' },
      { id: `ca_list_${n}`, name: 'Khách cũ (danh sách)', subtype: 'CUSTOM' },
    ];
  }

  async listBusinesses() {
    return [
      { id: 'biz1', name: 'Mock Business', owned_product_catalogs: { data: [{ id: 'cat1', name: 'Danh mục chính' }] } },
    ];
  }

  async listAdAccounts() {
    return MOCK_ACCOUNTS;
  }

  async listCampaigns(_t: string, act: string) {
    return structure(act).campaigns;
  }
  async listAdSets(_t: string, act: string) {
    return mockStructure(act).adsets;
  }
  async listAds(_t: string, act: string) {
    return mockStructure(act).ads;
  }
  async listCreatives(_t: string, act: string) {
    return structure(act).creatives;
  }

  async getInsights(_t: string, act: string, q: InsightQuery): Promise<MetaInsight[]> {
    const acc = MOCK_ACCOUNTS.find((a) => a.id === act);
    if (!acc) return [];
    const today = todayIn(acc.timezone_name, this.now());
    const s = structure(act);
    const out: MetaInsight[] = [];
    for (let d = q.since; d <= q.until; d = addDays(d, 1)) {
      if (d >= today) break; // dữ liệu tới hôm qua
      const rows = s.ads.map((ad) => {
        const adset = s.adsets.find((x) => x.id === ad.adset_id)!;
        const campaign = s.campaigns.find((x) => x.id === adset.campaign_id)!;
        return adDay(act, ad, adset, campaign, d, today);
      });
      if (q.level === 'ad') {
        out.push(...rows);
        continue;
      }
      if (q.level === 'adset') {
        for (const adset of s.adsets) {
          const mine = rows.filter((x) => x.adset_id === adset.id);
          if (!mine.length) continue;
          const sumK = (k: 'spend' | 'impressions' | 'reach' | 'clicks' | 'inline_link_clicks') =>
            mine.reduce((t, x) => t + Number(x[k] ?? 0), 0);
          const agg: MetaInsight = {
            date_start: d,
            date_stop: d,
            account_id: act.replace('act_', ''),
            campaign_id: adset.campaign_id,
            adset_id: adset.id,
            spend: round(sumK('spend'), acc.currency),
            impressions: String(sumK('impressions')),
            reach: String(sumK('reach')),
            clicks: String(sumK('clicks')),
            inline_link_clicks: String(sumK('inline_link_clicks')),
            actions: sumActions(mine, 'actions', acc.currency),
            action_values: sumActions(mine, 'action_values', acc.currency),
          };
          out.push(...(q.breakdown ? splitRow(agg, MOCK_BREAKDOWNS[q.breakdown], acc.currency) : [agg]));
        }
        continue;
      }
      const sum = (k: 'spend' | 'impressions' | 'reach' | 'clicks' | 'inline_link_clicks') =>
        rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
      let spend = sum('spend');
      if (act === MOCK_DISCREPANCY.account && d === addDays(today, -MOCK_DISCREPANCY.daysAgo)) {
        spend *= MOCK_DISCREPANCY.factor;
      }
      out.push({
        date_start: d,
        date_stop: d,
        account_id: act.replace('act_', ''),
        spend: round(spend, acc.currency),
        impressions: String(sum('impressions')),
        reach: String(sum('reach')),
        frequency: (sum('impressions') / Math.max(1, sum('reach'))).toFixed(6),
        clicks: String(sum('clicks')),
        inline_link_clicks: String(sum('inline_link_clicks')),
        actions: sumActions(rows, 'actions', acc.currency),
        action_values: sumActions(rows, 'action_values', acc.currency),
      });
    }
    return out;
  }
}
