/**
 * Sparkline SVG (không thư viện): kỳ này nét liền, kỳ trước nét đứt. Giá trị null (ngày chưa có dữ liệu) bị bỏ qua.
 * Chỉ vẽ số đã tính; Number chỉ để vẽ.
 */
export function Sparkline({
  values,
  prev,
  tone = 'neutral',
  width = 160,
  height = 40,
  label,
}: {
  values: (string | null)[];
  prev?: (string | null)[];
  tone?: 'good' | 'bad' | 'neutral';
  width?: number;
  height?: number;
  label?: string;
}) {
  const nums = [...values, ...(prev ?? [])].filter((v): v is string => v != null).map(Number);
  if (!nums.length) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const n = Math.max(values.length, prev?.length ?? 0, 2);
  const path = (series: (string | null)[]) => {
    let d = '';
    let pen = false;
    series.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      const x = (i / (n - 1)) * (width - 4) + 2;
      const y = height - 3 - ((Number(v) - min) / span) * (height - 6);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const stroke =
    tone === 'good' ? 'var(--color-success)' : tone === 'bad' ? 'var(--color-danger)' : 'var(--color-brand)';
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {prev ? (
        <path
          d={path(prev)}
          fill="none"
          stroke="var(--color-fg-tertiary)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.6}
        />
      ) : null}
      <path d={path(values)} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
