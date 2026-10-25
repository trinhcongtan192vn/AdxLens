/**
 * Strategy Status Overview (Madgicx 360° Meta Dashboard): mỗi giai đoạn phễu một cột — cột = % chi tiêu, chấm nối =
 * ROAS. SVG tĩnh từ số đã tính ở `stageAnalysis`; không có ROAS thì không vẽ chấm.
 */
export function StageChart({
  rows,
  label,
  roasLabel,
  shareLabel,
}: {
  rows: { stage: string; name: string; spendShare: number; roas: string | null }[];
  label: string;
  roasLabel: string;
  shareLabel: string;
}) {
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 44, t: 16, b: 36 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const col = iw / Math.max(1, rows.length);
  const maxShare = Math.max(10, ...rows.map((r) => r.spendShare));
  const roasVals = rows.map((r) => (r.roas == null ? null : Number(r.roas)));
  const maxRoas = Math.max(1, ...roasVals.filter((v): v is number => v != null));
  const x = (i: number) => pad.l + col * i + col / 2;
  const yShare = (v: number) => pad.t + ih - (v / maxShare) * ih;
  const yRoas = (v: number) => pad.t + ih - (v / maxRoas) * ih;
  const pts = roasVals.map((v, i) => (v == null ? null : ([x(i), yRoas(v)] as const)));
  const path = pts
    .filter((p): p is readonly [number, number] => p != null)
    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');
  return (
    <figure className="px-3 pt-3" data-testid="stage-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="stroke-line" />
        <text x={pad.l - 6} y={pad.t + 4} textAnchor="end" className="fill-fg-tertiary text-[10px]">
          {maxShare}%
        </text>
        <text x={W - pad.r + 6} y={pad.t + 4} className="fill-fg-tertiary text-[10px]">
          {maxRoas.toFixed(1)}x
        </text>
        {rows.map((r, i) => (
          <g key={r.stage}>
            <rect
              x={x(i) - col * 0.25}
              width={col * 0.5}
              y={yShare(r.spendShare)}
              height={pad.t + ih - yShare(r.spendShare)}
              rx={3}
              className="fill-brand opacity-70"
            />
            <text x={x(i)} y={yShare(r.spendShare) - 4} textAnchor="middle" className="fill-fg text-[10px]">
              {r.spendShare}%
            </text>
            <text x={x(i)} y={H - 14} textAnchor="middle" className="fill-fg-secondary text-[11px]">
              {r.name}
            </text>
          </g>
        ))}
        {path ? <path d={path} fill="none" className="stroke-warning" strokeWidth={2} /> : null}
        {pts.map((p, i) =>
          p ? (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={4} className="fill-warning" />
              <text x={p[0] + 6} y={p[1] - 6} className="fill-fg text-[10px]">
                {roasVals[i]!.toFixed(2)}x
              </text>
            </g>
          ) : null,
        )}
      </svg>
      <figcaption className="flex gap-4 text-caption text-fg-tertiary">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-brand opacity-70" aria-hidden /> {shareLabel}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-warning" aria-hidden /> {roasLabel}
        </span>
      </figcaption>
    </figure>
  );
}
