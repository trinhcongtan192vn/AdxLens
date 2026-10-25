import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StageChart } from './stage-chart';

describe('biểu đồ giai đoạn phễu (Strategy Status Overview)', () => {
  it('một cột / giai đoạn với % chi tiêu; chấm ROAS chỉ khi có ROAS', () => {
    const html = renderToStaticMarkup(
      <StageChart
        label="x"
        shareLabel="% chi tiêu"
        roasLabel="ROAS"
        rows={[
          { stage: 'prospecting', name: 'Tìm khách mới', spendShare: 62.5, roas: '2.40' },
          { stage: 'retargeting', name: 'Bám đuổi', spendShare: 37.5, roas: null },
        ]}
      />,
    );
    expect(html.match(/<rect/g)).toHaveLength(2);
    expect(html.match(/<circle/g)).toHaveLength(1);
    expect(html).toContain('62.5%');
    expect(html).toContain('2.40x');
    expect(html).toContain('Bám đuổi');
  });
});
