import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './mini-markdown';

describe('markdown tối giản cho câu trả lời AI', () => {
  it('trong dòng: đậm, nghiêng, code; không coi dấu * trong số / phép nhân là nghiêng', () => {
    expect(parseInline('**Chi tiêu:** 1.055.600 VND (-0,1%)')).toEqual([
      { kind: 'bold', text: 'Chi tiêu:' },
      { kind: 'text', text: ' 1.055.600 VND (-0,1%)' },
    ]);
    expect(parseInline('xem *giai đoạn học* và `cpm`')).toEqual([
      { kind: 'text', text: 'xem ' },
      { kind: 'italic', text: 'giai đoạn học' },
      { kind: 'text', text: ' và ' },
      { kind: 'code', text: 'cpm' },
    ]);
    expect(parseInline('2 * 3 = 6')).toEqual([{ kind: 'text', text: '2 * 3 = 6' }]);
  });

  it('câu trả lời thật của agent: đoạn mở đầu + danh sách + đoạn kết luận', () => {
    const blocks = parseMarkdown(
      [
        'Chiến dịch «Cdich» — kỳ 7 ngày gần nhất so với kỳ trước:',
        '',
        '- **Chi tiêu:** 1.055.600 VND (kỳ trước 1.056.531 VND, -0,1%)',
        '- **Kết quả:** 113 (kỳ trước 121, -6,6%)',
        '',
        '→ Chi tiêu gần như không đổi nhưng số kết quả giảm.',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(blocks[1]).toMatchObject({
      kind: 'list',
      ordered: false,
      items: [
        [{ kind: 'bold', text: 'Chi tiêu:' }, {}],
        [{}, {}],
      ],
    });
  });

  it('tiêu đề, danh sách đánh số, bảng, dòng tiếp nối của mục danh sách', () => {
    const blocks = parseMarkdown(
      [
        '## Tóm tắt',
        '1. Giảm ngân sách',
        '   nhóm QC A',
        '2. Tạm dừng QC B',
        '',
        '| Chỉ số | Kỳ này |',
        '|---|---:|',
        '| CPM | 24.870 |',
        '| CTR | 1,27% |',
      ].join('\n'),
    );
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, inline: [{ kind: 'text', text: 'Tóm tắt' }] });
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: true });
    expect((blocks[1] as { items: unknown[][] }).items[0]).toHaveLength(3);
    expect(blocks[2]).toMatchObject({
      kind: 'table',
      rows: [
        [[{ text: 'CPM' }], [{ text: '24.870' }]],
        [{}, {}],
      ],
    });
  });

  it('thẻ HTML trong nội dung chỉ là chữ (không thành phần tử)', () => {
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: '<script>alert(1)</script>' }]] },
    ]);
  });
});
