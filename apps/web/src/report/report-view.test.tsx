import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReportContent } from '@adxlens/core/reporting';
import { ReportView } from './report-view';

const k = (spend: string, results: number) => ({
  spend,
  impressions: 10000,
  reach: 8000,
  clicks: 300,
  linkClicks: 200,
  results,
  conversionValue: '0',
  ctr: 0.02,
  cpa: results ? (Number(spend) / results).toFixed(4) : null,
  roas: null,
  cpm: null,
  resultTypes: ['lead'],
});

const content: ReportContent = {
  version: 1,
  client: { id: 'c', name: 'Thời trang Linh' },
  brand: { displayName: 'Agency Sao Mai', logoPath: null, primaryColor: '#123456' },
  locale: 'vi',
  kind: 'periodic',
  period: { from: '2026-10-16', to: '2026-10-22' },
  compare: { from: '2026-10-09', to: '2026-10-15' },
  generatedAt: '2026-10-23T03:00:00Z',
  source: {
    matchedAt: '2026-10-23T01:12:00Z',
    attribution: '7d_click_1d_view',
    currencies: ['VND'],
    timezones: ['Asia/Ho_Chi_Minh'],
  },
  accounts: [
    {
      id: 'a',
      name: 'Linh 01',
      metaAccountId: 'act_1',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      kpis: k('1500000', 30),
      prevKpis: k('1000000', 30),
      daily: [{ date: '2026-10-16', spend: '200000', results: 4 }],
      health: 85,
      reconciliation: { status: 'ok', maxSpendDeltaPct: '0.1' },
      topCampaigns: [{ name: 'Bán hàng', spend: '900000', results: 20, cpa: '45000', roas: '3.2' }],
    },
  ],
  findings: [
    {
      accountId: 'a',
      ruleId: 'creative_fatigue',
      severity: 'high',
      entityName: 'Video A',
      why: { key: 'rules.creative_fatigue.why', params: { freqRise: 62, ctrDrop: 50, freq: 3.4 } },
      whatToDo: { key: 'rules.creative_fatigue.what' },
      impact: { amount: '2850000.0000', currency: 'VND' },
    },
  ],
};

const html = (c: ReportContent, edits = {}, showBadge = true) =>
  renderToStaticMarkup(<ReportView content={c} edits={edits} summary={null} logoUrl={null} showBadge={showBadge} />);

describe('mẫu báo cáo', () => {
  it('nhãn theo ngôn ngữ báo cáo; số định dạng vi; nguồn số liệu P0-13; nhãn Powered by', () => {
    const h = html(content);
    expect(h).toContain('Báo cáo định kỳ');
    expect(h).toContain('Báo cáo cho Thời trang Linh');
    expect(h).toContain('1.500.000 VND');
    expect(h).toContain('▲ +50%');
    expect(h).toContain('Tần suất tăng 62% (lên 3,4)');
    expect(h).toContain('Tác động ước tính: 2.850.000 VND');
    expect(h).toContain('Khớp Meta tính đến');
    expect(h).toContain('attribution 7 ngày click / 1 ngày xem');
    expect(h).toContain('Powered by AdxLens');
    expect(h).toContain('16/10/2026');
  });

  it('báo cáo tiếng Anh dùng nhãn tiếng Anh', () => {
    const h = html({ ...content, locale: 'en' });
    expect(h).toContain('Performance report');
    expect(h).toContain('1,500,000 VND');
    expect(h).toContain('Issues to address');
  });

  it('ẩn mục, phần agency viết, không nhãn khi gói gỡ nhãn', () => {
    const h = html(
      content,
      { hiddenSections: ['findings'], workDone: 'Tắt 2 ad mệt', title: 'Báo cáo tuần 42' },
      false,
    );
    expect(h).not.toContain('Vấn đề cần xử lý');
    expect(h).toContain('Tắt 2 ad mệt');
    expect(h).toContain('Báo cáo tuần 42');
    expect(h).not.toContain('Powered by');
  });

  it('chưa đối chiếu → ghi rõ', () => {
    expect(html({ ...content, source: { ...content.source, matchedAt: null } })).toContain('Chưa đối chiếu với Meta');
  });
});
