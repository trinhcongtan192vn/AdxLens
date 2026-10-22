import { cn } from '../cn';

export type DeltaDirection = 'up' | 'down' | 'flat';

/**
 * Delta: màu theo tốt/xấu, không theo tăng/giảm (CPA tăng = xấu = đỏ). Luôn kèm mũi tên và dấu,
 * không dựa vào màu đơn thuần (design-system mục 7).
 */
export function Delta({
  text,
  direction,
  good,
  className,
  srLabel,
}: {
  /** Chuỗi đã định dạng theo locale, ví dụ "12,4%". Không kèm dấu: component tự thêm. */
  text: string;
  direction: DeltaDirection;
  /** true = thay đổi này tốt cho khách. Bỏ qua khi flat. */
  good?: boolean;
  className?: string;
  srLabel?: string;
}) {
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–';
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';
  const color =
    direction === 'flat' ? 'text-fg-tertiary' : good ? 'text-delta-pos' : 'text-delta-neg';
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 text-small font-medium',
        color,
        className,
      )}
    >
      <span aria-hidden>{arrow}</span>
      <span>
        {sign}
        {text}
      </span>
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </span>
  );
}
