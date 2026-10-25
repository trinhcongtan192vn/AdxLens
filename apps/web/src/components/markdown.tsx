import { Fragment } from 'react';
import { cn } from '@adxlens/ui';
import { parseMarkdown, type Inline } from '@/lib/mini-markdown';

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'bold' ? (
          <strong key={i} className="font-semibold text-fg">
            {p.text}
          </strong>
        ) : p.kind === 'italic' ? (
          <em key={i}>{p.text}</em>
        ) : p.kind === 'code' ? (
          <code key={i} className="rounded bg-surface px-1 font-mono text-caption">
            {p.text}
          </code>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Hiển thị markdown tối giản (câu trả lời AI) bằng phần tử React — không dùng HTML thô. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={cn('flex flex-col gap-2 leading-relaxed', className)} data-testid="markdown">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          const Tag = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
          return (
            <Tag key={i} className={cn('font-semibold text-fg', b.level === 1 ? 'text-h4' : 'text-body')}>
              <Inlines parts={b.inline} />
            </Tag>
          );
        }
        if (b.kind === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} className={cn('flex flex-col gap-1 pl-5', b.ordered ? 'list-decimal' : 'list-disc')}>
              {b.items.map((it, j) => (
                <li key={j} className="pl-0.5">
                  <Inlines parts={it} />
                </li>
              ))}
            </Tag>
          );
        }
        if (b.kind === 'table') {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-caption">
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j} className="border-b border-line px-2 py-1 text-left font-semibold text-fg">
                        <Inlines parts={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className="num border-b border-line px-2 py-1">
                          <Inlines parts={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Inlines parts={l} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
