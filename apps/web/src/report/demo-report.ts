import type { ReportContent } from '@adxlens/core/reporting';

const kpis = (spend: string, results: number, value: string, impressions: number, clicks: number) => ({
  spend,
  impressions,
  reach: Math.round(impressions / 1.6),
  clicks: Math.round(clicks * 1.3),
  linkClicks: clicks,
  results,
  conversionValue: value,
  ctr: clicks / impressions,
  cpa: (Number(spend) / results).toFixed(4),
  roas: (Number(value) / Number(spend)).toFixed(2),
  cpm: ((Number(spend) / impressions) * 1000).toFixed(2),
  resultTypes: ['offsite_conversion.fb_pixel_purchase'],
});

const daily = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-${String(16 + i).padStart(2, '0')}`,
  spend: String(2_100_000 + ((i * 337_000) % 900_000)),
  results: 18 + ((i * 7) % 9),
}));

/**
 * Báo cáo mẫu công khai `/r/demo` (trang chủ "Xem báo cáo mẫu", PRD P0-02): số liệu minh họa cố định, đánh
 * dấu `demo` để mẫu báo cáo ghi rõ "không phải dữ liệu thật". Không đọc DB.
 */
export function demoReportContent(locale: 'vi' | 'en'): ReportContent {
  return {
    version: 1,
    client: { id: 'demo', name: locale === 'en' ? 'Sample Coffee Co.' : 'Cà phê Mẫu' },
    brand: { displayName: locale === 'en' ? 'Sample Agency' : 'Agency Mẫu', logoPath: null, primaryColor: '#4F46E5' },
    locale,
    kind: 'periodic',
    period: { from: '2026-10-16', to: '2026-10-22' },
    compare: { from: '2026-10-09', to: '2026-10-15' },
    generatedAt: '2026-10-23T02:00:00.000Z',
    demo: true,
    source: {
      matchedAt: '2026-10-23T01:12:00.000Z',
      attribution: '7d_click_1d_view',
      currencies: ['VND'],
      timezones: ['Asia/Ho_Chi_Minh'],
    },
    accounts: [
      {
        id: 'demo-1',
        name: locale === 'en' ? 'Sample Coffee 01' : 'Cà phê Mẫu 01',
        metaAccountId: 'act_000000001',
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
        kpis: kpis('17850000', 152, '61200000', 412_000, 7_830),
        prevKpis: kpis('16200000', 131, '52900000', 398_000, 7_410),
        daily,
        health: 78,
        reconciliation: { status: 'ok', maxSpendDeltaPct: '0.1' },
        topCampaigns: [
          {
            name: locale === 'en' ? 'Sales · Holiday' : 'Bán hàng · Lễ',
            spend: '9400000',
            results: 96,
            cpa: '97916.6667',
            roas: '4.10',
          },
          {
            name: locale === 'en' ? 'Leads · Wholesale' : 'Thu lead · Sỉ',
            spend: '5200000',
            results: 41,
            cpa: '126829.2683',
            roas: null,
          },
          { name: 'Traffic · Blog', spend: '3250000', results: 15, cpa: '216666.6667', roas: null },
        ],
      },
    ],
    findings: [
      {
        accountId: 'demo-1',
        ruleId: 'creative_fatigue',
        severity: 'high',
        entityName: 'Video A - Tết',
        why: { key: 'rules.creative_fatigue.why', params: { freqRise: 62, ctrDrop: 48, freq: 3.4 } },
        whatToDo: { key: 'rules.creative_fatigue.what' },
        impact: { amount: '2850000', currency: 'VND' },
      },
      {
        accountId: 'demo-1',
        ruleId: 'starved_winner',
        severity: 'medium',
        entityName: 'Carousel C - Sale 10.10',
        why: { key: 'rules.starved_winner.why', params: { better: 41, share: 8 } },
        whatToDo: { key: 'rules.starved_winner.what' },
        impact: null,
      },
    ],
  };
}
