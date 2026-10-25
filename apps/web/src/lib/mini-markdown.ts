/**
 * Markdown tối giản cho câu trả lời AI (AI Agents): tiêu đề, danh sách gạch đầu dòng / đánh số, bảng, đoạn văn; trong
 * dòng: **đậm**, *nghiêng*, `code`. Hàm thuần trả cây khối để component dựng thành phần tử React (không dùng HTML thô →
 * không chèn được script / thẻ lạ từ nội dung LLM).
 */
export type Inline = { kind: 'text' | 'bold' | 'italic' | 'code'; text: string };
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

const BULLET = /^\s*[-*•+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Phần trong dòng: `code` trước (không xử lý bên trong), rồi **đậm**, rồi *nghiêng* / _nghiêng_. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re =
    /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: 'bold', text: (m[2] ?? m[3])! });
    else out.push({ kind: 'italic', text: (m[4] ?? m[5])! });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

const cells = (line: string) =>
  TABLE_ROW.exec(line)![1]!
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: 'heading', level: Math.min(h[1]!.length, 3) as 1 | 2 | 3, inline: parseInline(h[2]!) });
      continue;
    }
    // Bảng: dòng tiêu đề | … | + dòng phân cách |---|.
    if (TABLE_ROW.test(line) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const b = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (b) {
      flush();
      const ordered = !BULLET.test(line);
      const prev = blocks[blocks.length - 1];
      const item = parseInline(b[1]!);
      if (prev?.kind === 'list' && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
      continue;
    }
    // Dòng tiếp nối ngay sau một mục danh sách (thụt lề) → nối vào mục đó.
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev?.kind === 'list' && /^\s{2,}\S/.test(line)) {
      prev.items[prev.items.length - 1]!.push({ kind: 'text', text: ' ' }, ...parseInline(line.trim()));
      continue;
    }
    para.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
